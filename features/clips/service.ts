import "server-only"

import type { Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { normalizeEffects, type ClipEffects } from "../effects/schema"
import { autoEffectsFor } from "../effects/service"
import { postprocessCandidates } from "../highlights/postprocess"
import { parseCandidatesJson } from "../highlights/prompt"
import { assetRepository, projectRepository } from "../projects/repository"
import { transcriptRepository } from "../transcription/repository"
import { clipRepository } from "./repository"
import {
  CLIP_MAX_EDIT_MS,
  CLIP_MIN_EDIT_MS,
  type ClipEdit,
  type ClipPlan,
  type ClipStatus,
} from "./schema"

const REVIEWABLE = new Set(["awaiting_layout", "ready_for_review", "done"])

export async function applyManualSelection(
  db: Db,
  projectId: string,
  text: string
) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (!REVIEWABLE.has(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Wait for analysis to finish before adding clips"
    )
  }
  const transcript = await transcriptRepository(db).get(projectId)
  const source = await assetRepository(db).findByKind(projectId, "source")
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
  const clips = await clipRepository(db).replaceCandidates(
    projectId,
    candidates
  )
  await projectRepository(db).setAwaitingManualSelection(projectId, false)
  return clips.length
}

const REVIEW_STATUSES: ClipStatus[] = ["candidate", "approved", "rejected"]

export async function setClipReviewStatus(
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
  const clip = await clips.getOrThrow(clipId)
  if (clip.projectId !== projectId)
    throw new AppError("NOT_FOUND", "Clip not found")
  if (clip.status === "rendering") {
    throw new AppError("CONFLICT", "This clip is rendering")
  }
  return clips.update(clipId, { status })
}

export async function updateClip(
  db: Db,
  projectId: string,
  clipId: string,
  edit: ClipEdit
) {
  const clips = clipRepository(db)
  const clip = await clips.getOrThrow(clipId)
  if (clip.projectId !== projectId) {
    throw new AppError("NOT_FOUND", "Clip not found")
  }
  if (clip.status === "rendering") {
    throw new AppError("CONFLICT", "Wait for this clip to finish rendering")
  }
  const source = await assetRepository(db).findByKind(projectId, "source")
  const durationMs = source?.durationMs ?? 0
  const length = edit.endMs - edit.startMs
  if (edit.endMs > durationMs || length <= 0) {
    throw new AppError("VALIDATION", "The clip must stay inside the recording")
  }
  if (length < CLIP_MIN_EDIT_MS || length > CLIP_MAX_EDIT_MS) {
    throw new AppError(
      "VALIDATION",
      `Clips must be between ${CLIP_MIN_EDIT_MS / 1000} and ${CLIP_MAX_EDIT_MS / 1000} seconds long`
    )
  }
  const trimmed = edit.startMs !== clip.startMs || edit.endMs !== clip.endMs
  const project = await projectRepository(db).getOrThrow(projectId)
  const range = { startMs: edit.startMs, endMs: edit.endMs }
  const stored = edit.effects ?? clip.effects
  let effects: ClipEffects | null | undefined
  if (stored?.edited) {
    effects = {
      edited: true,
      events: normalizeEffects(stored.events, range),
    }
  } else if (trimmed && (stored || project.settings.autoEffects)) {
    effects =
      (await autoEffectsFor(db, projectId, [{ ...clip, ...range }])).get(
        clip.id
      ) ?? null
  } else if (edit.effects) {
    effects = {
      edited: false,
      events: normalizeEffects(edit.effects.events, range),
    }
  }
  return clips.update(clipId, {
    startMs: edit.startMs,
    endMs: edit.endMs,
    title: edit.title,
    hook: edit.hook,
    captionOverrides: {
      ...edit.captionOverrides,
      pages: trimmed ? [] : edit.captionOverrides.pages,
    },
    layoutOverride: edit.layoutOverride,
    ...(effects === undefined ? {} : { effects }),
    status: clip.status === "rendered" ? "approved" : clip.status,
  })
}

export async function approveAllCandidates(db: Db, projectId: string) {
  const clips = clipRepository(db)
  const ids = (await clips.listForProject(projectId))
    .filter((clip) => clip.status === "candidate")
    .map((clip) => clip.id)
  await clips.setStatus(ids, "approved")
  return ids.length
}

export async function planClipEffects(
  db: Db,
  projectId: string,
  clipId: string,
  plan: ClipPlan
): Promise<ClipEffects> {
  const clip = await clipRepository(db).getOrThrow(clipId)
  if (clip.projectId !== projectId) {
    throw new AppError("NOT_FOUND", "Clip not found")
  }
  const effects = (
    await autoEffectsFor(db, projectId, [{ ...clip, ...plan }])
  ).get(clip.id)
  if (!effects) {
    throw new AppError("CONFLICT", "Confirm the layout before planning effects")
  }
  return effects
}
