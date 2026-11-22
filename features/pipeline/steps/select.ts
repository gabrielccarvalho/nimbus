import "server-only"

import { signalsRepository } from "../../analysis/repository"
import { clipRepository } from "../../clips/repository"
import { selectHighlights } from "../../highlights"
import type { JobHandler } from "../../jobs/worker-loop"
import { layoutRepository } from "../../layout/repository"
import { projectRepository } from "../../projects/repository"
import { transcriptRepository } from "../../transcription/repository"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const selectStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = beginStep(db, job.projectId, "selecting")
  const settings = project.settings
  const next = layoutRepository(db).get(project.id)?.confirmedByUser
    ? "ready_for_review"
    : "awaiting_layout"

  if (settings.selectorMode === "manual") {
    projectRepository(db).setAwaitingManualSelection(project.id, true)
    clipRepository(db).replaceCandidates(project.id, [])
    completeStep(db, project.id, next)
    return
  }

  const transcript = transcriptRepository(db).get(project.id)
  const signals = signalsRepository(db).get(project.id)
  const durationMs = sourceAsset(db, project).durationMs ?? 0
  reportProgress(10)

  const { candidates, fallbackReason } = await selectHighlights(
    settings.selectorMode,
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
      limits: {
        minMs: settings.clipMinMs,
        maxMs: settings.clipMaxMs,
        maxCount: settings.targetClipCount,
      },
      signal,
    },
    logger
  )
  throwIfAborted(signal)

  clipRepository(db).replaceCandidates(
    project.id,
    candidates.map((c) => ({
      startMs: c.startMs,
      endMs: c.endMs,
      title: c.title,
      hook: c.hook,
      reason: fallbackReason
        ? `Claude unavailable (${fallbackReason}). ${c.reason}`
        : c.reason,
      score: c.score,
    }))
  )
  projectRepository(db).setAwaitingManualSelection(project.id, false)
  logger.info(
    { candidates: candidates.length, fallback: Boolean(fallbackReason) },
    "selected"
  )
  completeStep(db, project.id, next)
}
