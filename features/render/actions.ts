"use server"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { idSchema, parseId, runAction } from "@/lib/server-action"

import { startClipRenders, startEditRender } from "./service"

export async function renderClipsAction(projectId: unknown, clipIds: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "renderClips",
    () => {
      const ids = z.array(idSchema).min(1).max(100).safeParse(clipIds)
      if (!ids.success) throw new AppError("VALIDATION", "Pick clips to render")
      return startClipRenders(getDb(), id, ids.data)
    },
    [`/projects/${id}`]
  )
}

export async function renderEditAction(projectId: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "renderEdit",
    async () => {
      await startEditRender(getDb(), id)
    },
    [`/projects/${id}`]
  )
}
