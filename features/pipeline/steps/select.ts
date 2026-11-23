import "server-only"

import { getStorage } from "@/lib/storage"

import { signalsRepository } from "../../analysis/repository"
import { clipRepository } from "../../clips/repository"
import { loadAudienceHeatmap } from "../../downloads/service"
import { selectHighlights } from "../../highlights"
import { proxyFrameSource } from "../../highlights/frames"
import { NICHE_PROFILES, resolveNiche } from "../../highlights/niches"
import { postprocessCandidates } from "../../highlights/postprocess"
import type { Candidate, RawCandidate } from "../../highlights/types"
import type { JobHandler } from "../../jobs/worker-loop"
import { layoutRepository } from "../../layout/repository"
import { assetRepository, projectRepository } from "../../projects/repository"
import { transcriptRepository } from "../../transcription/repository"
import { MAX_DETAIL_CANDIDATES, type StepDetail } from "../detail"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const selectStep: JobHandler = async ({
  job,
  db,
  signal,
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
  const next = (await layoutRepository(db).get(project.id))?.confirmedByUser
    ? "ready_for_review"
    : "awaiting_layout"

  if (settings.selectorMode === "manual" && !more) {
    await projectRepository(db).setAwaitingManualSelection(project.id, true)
    await clipRepository(db).replaceCandidates(project.id, [])
    await completeStep(db, project.id, next)
    return
  }

  const transcript = await transcriptRepository(db).get(project.id)
  const signals = await signalsRepository(db).get(project.id)
  const durationMs = (await sourceAsset(db, project)).durationMs ?? 0
  const audience = await loadAudienceHeatmap(db, project, { signal, logger })
  const niche = resolveNiche(settings.niche, project.name)
  const proxy = await assetRepository(db).findByKind(project.id, "proxy")
  const frames = proxy
    ? proxyFrameSource(getStorage().resolve(proxy.storageKey))
    : undefined
  const reviewing = settings.selectorMode === "anthropic" && Boolean(frames)
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

  const { candidates, fallbackReason, reviewFailure } = await selectHighlights(
    settings.selectorMode === "manual" ? "heuristic" : settings.selectorMode,
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
      exclude: existing,
      niche: NICHE_PROFILES[niche],
      frames,
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
            exclude: existing,
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

  const clips = clipRepository(db)
  await (more ? clips.addCandidates : clips.replaceCandidates)(
    project.id,
    candidates.map((c) => ({
      startMs: c.startMs,
      endMs: c.endMs,
      title: c.title,
      hook: c.hook,
      reason: fallbackReason
        ? `Claude unavailable (${fallbackReason}). ${c.reason}`
        : reviewFailure
          ? `Not checked against the video (${reviewFailure}). ${c.reason}`
          : c.reason,
      score: c.score,
    }))
  )
  await projectRepository(db).setAwaitingManualSelection(project.id, false)
  logger.info(
    {
      candidates: candidates.length,
      more,
      niche,
      fallback: Boolean(fallbackReason),
      reviewed: reviewing && !fallbackReason && !reviewFailure,
    },
    "selected"
  )
  await completeStep(db, project.id, next)
}
