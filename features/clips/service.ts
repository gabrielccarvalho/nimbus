import "server-only"

import type { Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { postprocessCandidates } from "../highlights/postprocess"
import { parseCandidatesJson } from "../highlights/prompt"
import { assetRepository, projectRepository } from "../projects/repository"
import { transcriptRepository } from "../transcription/repository"
import { clipRepository } from "./repository"
import type { ClipStatus } from "./schema"

const REVIEWABLE = new Set(["awaiting_layout", "ready_for_review", "done"])

export function applyManualSelection(db: Db, projectId: string, text: string) {
  const project = projectRepository(db).getOrThrow(projectId)
  if (!REVIEWABLE.has(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Wait for analysis to finish before adding clips"
    )
  }
  const transcript = transcriptRepository(db).get(projectId)
  const source = assetRepository(db).findByKind(projectId, "source")
  const candidates = postprocessCandidates(parseCandidatesJson(text), {
    durationMs: source?.durationMs ?? 0,
    words: transcript?.words ?? [],
    segments: transcript?.segments ?? [],
    limits: {
      minMs: project.settings.clipMinMs,
      maxMs: project.settings.clipMaxMs,
      maxCount: project.settings.targetClipCount,
    },
  })
  if (candidates.length === 0) {
    throw new AppError(
      "VALIDATION",
      "None of those clips fit the recording and length limits"
    )
  }
  const clips = clipRepository(db).replaceCandidates(projectId, candidates)
  projectRepository(db).setAwaitingManualSelection(projectId, false)
  return clips.length
}

const REVIEW_STATUSES: ClipStatus[] = ["candidate", "approved", "rejected"]

export function setClipReviewStatus(
  db: Db,
  projectId: string,
  clipId: string,
  status: ClipStatus
) {
  if (!REVIEW_STATUSES.includes(status)) {
    throw new AppError(
      "VALIDATION",
      "Clips can only be approved, rejected or reset"
    )
  }
  const clips = clipRepository(db)
  const clip = clips.getOrThrow(clipId)
  if (clip.projectId !== projectId)
    throw new AppError("NOT_FOUND", "Clip not found")
  if (clip.status === "rendering") {
    throw new AppError("CONFLICT", "This clip is rendering")
  }
  return clips.update(clipId, { status })
}
