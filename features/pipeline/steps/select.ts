import "server-only"

import { getStorage } from "@/lib/storage"

import {
  claudeRunsUsedUp,
  recordUsage,
  resolveAnthropicKey,
} from "../../accounts/usage"
import { signalsRepository } from "../../analysis/repository"
import { clipParts } from "../../clips/parts"
import { clipRepository } from "../../clips/repository"
import { loadAudienceHeatmap } from "../../downloads/service"
import { autoEffectsFor } from "../../effects/service"
import { loadPlaybook } from "../../insights/repository"
import { selectHighlights } from "../../highlights"
import { proxyFrameSource } from "../../highlights/frames"
import { NICHE_PROFILES, resolveNiche } from "../../highlights/niches"
import { postprocessCandidates } from "../../highlights/postprocess"
import type { Candidate, RawCandidate } from "../../highlights/types"
import type { JobHandler } from "../../jobs/worker-loop"
import { clipStartLayout } from "../../layout/defaults"
import { assetRepository, projectRepository } from "../../projects/repository"
import { transcriptRepository } from "../../transcription/repository"
import { MAX_DETAIL_CANDIDATES, type StepDetail } from "../detail"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const selectStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
  reportProgress,
  reportDetail,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "selecting")
  const settings = project.settings
  const more = job.payload.more === true
  const existing = more
    ? await clipRepository(db).listForProject(project.id)
    : []
  const exclude = existing.flatMap(clipParts)

  if (settings.selectorMode === "manual" && !more) {
    await projectRepository(db).setAwaitingManualSelection(project.id, true)
    await clipRepository(db).replaceCandidates(project.id, [])
    await completeStep(db, project.id, "ready_for_review")
    return
  }

  const transcript = await transcriptRepository(db).get(project.id)
  const signals = await signalsRepository(db).get(project.id)
  const durationMs = (await sourceAsset(db, project)).durationMs ?? 0
  const audience = await loadAudienceHeatmap(db, project, { signal, logger })
  const niche = resolveNiche(settings.niche, project.name)
  const playbook = await loadPlaybook(db, project.workspaceId)
  const proxy = await assetRepository(db).findByKind(project.id, "proxy")
  const frames = proxy
    ? proxyFrameSource(
        await getStorage().localCopy(proxy.storageKey, scratch, signal)
      )
    : undefined
  const usedUp =
    settings.selectorMode === "anthropic"
      ? await claudeRunsUsedUp(db, project.workspaceId)
      : null
  const selector =
    settings.selectorMode === "manual" || usedUp
      ? "heuristic"
      : settings.selectorMode
  const reviewing = selector === "anthropic" && Boolean(frames)
  const firstPassShare = reviewing ? 50 : 80
  reportProgress(10)
  const limits = {
    minMs: settings.clipMinMs,
    maxMs: settings.clipMaxMs,
    maxCount: settings.targetClipCount,
  }
  const showCandidates = (
    candidates: readonly Candidate[],
    parts: { done: number; total: number } | null
  ) =>
    reportDetail({
      kind: "select",
      candidates: candidates.slice(0, MAX_DETAIL_CANDIDATES).map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        title: c.title,
        score: c.score,
      })),
      parts,
    } satisfies StepDetail)
  const found: RawCandidate[] = []

  const { candidates, reviewFailure, ...selected } = await selectHighlights(
    selector,
    {
      durationMs,
      words: transcript?.words ?? [],
      segments: transcript?.segments ?? [],
      signals: signals ?? {
        silences: [],
        loudness: [],
        loudnessIntervalMs: 250,
        speechDensity: [],
      },
      limits,
      language: transcript?.language ?? settings.language,
      reactionPhrases: settings.reactionPhrases,
      audience,
      exclude,
      niche: NICHE_PROFILES[niche],
      playbook: playbook && {
        selection: playbook.selection,
        review: playbook.review,
      },
      frames,
      apiKey: await resolveAnthropicKey(db, project.workspaceId),
      onPart: (candidates, parts) => {
        found.push(...candidates)
        reportProgress(10 + (firstPassShare * parts.done) / parts.total)
        showCandidates(
          postprocessCandidates(found, {
            durationMs,
            words: transcript?.words ?? [],
            segments: transcript?.segments ?? [],
            limits,
            language: transcript?.language ?? settings.language,
            exclude,
          }),
          parts
        )
      },
      onReview: ({ done, total }) =>
        reportProgress(10 + firstPassShare + (30 * done) / total),
      signal,
    },
    logger
  )
  throwIfAborted(signal)
  showCandidates(candidates, null)
  const fallbackReason = usedUp?.message ?? selected.fallbackReason
  const usedClaude = selector === "anthropic" && !fallbackReason
  if (usedClaude) await recordUsage(db, project, "claude_run", 1)
  const reviewed = reviewing && !fallbackReason && !reviewFailure
  const appliedRuleIds = [
    ...(usedClaude ? (playbook?.ruleIds.selection ?? []) : []),
    ...(reviewed ? (playbook?.ruleIds.review ?? []) : []),
  ]

  const clips = clipRepository(db)
  const layout = await clipStartLayout(db, project)
  const inserted = await (more ? clips.addCandidates : clips.replaceCandidates)(
    project.id,
    candidates.map((c) => ({
      startMs: c.startMs,
      endMs: c.endMs,
      parts: c.parts ?? null,
      title: c.title,
      hook: c.hook,
      description: c.description ?? c.hook,
      reason: fallbackReason
        ? `Claude unavailable (${fallbackReason}). ${c.reason}`
        : reviewFailure
          ? `Not checked against the video (${reviewFailure}). ${c.reason}`
          : c.reason,
      score: c.score,
      layout,
      beats: c.beats ?? null,
      playbookRuleIds: appliedRuleIds.length > 0 ? appliedRuleIds : null,
    }))
  )
  if (settings.autoEffects) {
    const tracks = await autoEffectsFor(db, project.id, inserted)
    for (const [id, effects] of tracks) await clips.update(id, { effects })
  }
  await projectRepository(db).setAwaitingManualSelection(project.id, false)
  logger.info(
    {
      candidates: candidates.length,
      more,
      niche,
      fallback: Boolean(fallbackReason),
      reviewed,
    },
    "selected"
  )
  await completeStep(db, project.id, "ready_for_review")
}
