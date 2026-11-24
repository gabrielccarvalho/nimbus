"use server"

import { z } from "zod"

import { forProject } from "../accounts/session"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"

import {
  clipEditSchema,
  clipPlanSchema,
  clipRangeSchema,
  clipStatusSchema,
} from "./schema"
import {
  applyManualSelection,
  approveAllCandidates,
  createClipFromRange,
  planClipEffects,
  setClipReviewStatus,
  updateClip,
} from "./service"

export async function submitManualSelectionAction(
  projectId: unknown,
  json: unknown
) {
  const id = parseId(projectId, "project id")
  return runAction(
    "submitManualSelection",
    forProject(id, () => {
      const text = z.string().max(500_000).safeParse(json)
      if (!text.success)
        throw new AppError("VALIDATION", "Paste the JSON reply")
      return applyManualSelection(getDb(), id, text.data)
    }),
    [`/projects/${id}`]
  )
}

export async function setClipStatusAction(
  projectId: unknown,
  clipId: unknown,
  status: unknown
) {
  const project = parseId(projectId, "project id")
  const clip = parseId(clipId, "clip id")
  return runAction(
    "setClipStatus",
    forProject(project, async () => {
      const parsed = clipStatusSchema.safeParse(status)
      if (!parsed.success)
        throw new AppError("VALIDATION", "Invalid clip status")
      await setClipReviewStatus(getDb(), project, clip, parsed.data)
    }),
    [`/projects/${project}`]
  )
}

export async function updateClipAction(
  projectId: unknown,
  clipId: unknown,
  edit: unknown
) {
  const project = parseId(projectId, "project id")
  const clip = parseId(clipId, "clip id")
  return runAction(
    "updateClip",
    forProject(project, async () => {
      const parsed = clipEditSchema.safeParse(edit)
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Invalid clip"
        )
      }
      const saved = await updateClip(getDb(), project, clip, parsed.data)
      return { effects: saved.effects }
    }),
    [`/projects/${project}`]
  )
}

export async function planClipEffectsAction(
  projectId: unknown,
  clipId: unknown,
  plan: unknown
) {
  const project = parseId(projectId, "project id")
  const clip = parseId(clipId, "clip id")
  return runAction(
    "planClipEffects",
    forProject(project, () => {
      const parsed = clipPlanSchema.safeParse(plan)
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Invalid clip range"
        )
      }
      return planClipEffects(getDb(), project, clip, parsed.data)
    }),
    []
  )
}

export async function approveAllCandidatesAction(projectId: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "approveAllCandidates",
    forProject(id, () => approveAllCandidates(getDb(), id)),
    [`/projects/${id}`]
  )
}

export async function createClipAction(projectId: unknown, range: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "createClip",
    forProject(id, async () => {
      const parsed = clipRangeSchema.safeParse(range)
      if (!parsed.success)
        throw new AppError("VALIDATION", "Pick where the clip starts and ends")
      const clip = await createClipFromRange(getDb(), id, parsed.data)
      return { clipId: clip.id }
    }),
    [`/projects/${id}`]
  )
}
