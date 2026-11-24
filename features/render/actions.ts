"use server"

import { z } from "zod"

import { forProject } from "../accounts/session"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { idSchema, parseId, runAction } from "@/lib/server-action"

import {
  cancelClipRenders,
  cancelEditRender,
  startClipRenders,
  startEditRender,
} from "./service"

export async function renderClipsAction(projectId: unknown, clipIds: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "renderClips",
    forProject(id, () => {
      const ids = z.array(idSchema).min(1).max(100).safeParse(clipIds)
      if (!ids.success) throw new AppError("VALIDATION", "Pick clips to render")
      return startClipRenders(getDb(), id, ids.data)
    }),
    [`/projects/${id}`]
  )
}

export async function renderEditAction(projectId: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "renderEdit",
    forProject(id, async () => {
      await startEditRender(getDb(), id)
    }),
    [`/projects/${id}`]
  )
}

export async function cancelClipRendersAction(projectId: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "cancelClipRenders",
    forProject(id, () => cancelClipRenders(getDb(), id)),
    [`/projects/${id}`]
  )
}

export async function cancelEditRenderAction(projectId: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "cancelEditRender",
    forProject(id, () => cancelEditRender(getDb(), id)),
    [`/projects/${id}`]
  )
}
