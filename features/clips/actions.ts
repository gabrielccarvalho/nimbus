"use server"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"

import { clipStatusSchema } from "./schema"
import { applyManualSelection, setClipReviewStatus } from "./service"

export async function submitManualSelectionAction(
  projectId: unknown,
  json: unknown
) {
  const id = parseId(projectId, "project id")
  return runAction(
    "submitManualSelection",
    () => {
      const text = z.string().max(500_000).safeParse(json)
      if (!text.success)
        throw new AppError("VALIDATION", "Paste the JSON reply")
      return applyManualSelection(getDb(), id, text.data)
    },
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
    () => {
      const parsed = clipStatusSchema.safeParse(status)
      if (!parsed.success)
        throw new AppError("VALIDATION", "Invalid clip status")
      setClipReviewStatus(getDb(), project, clip, parsed.data)
    },
    [`/projects/${project}`]
  )
}
