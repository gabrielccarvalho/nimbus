"use server"

import { revalidatePath } from "next/cache"

import { assertProjectAccess, requireActor } from "../accounts/session"
import { clipRepository } from "../clips/repository"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"

import { storedPublishInput } from "./metadata"
import { publishingRepository } from "./repository"
import { publishInputSchema } from "./schema"
import { queuePublication } from "./service"

export async function publishClipAction(clipId: unknown, input: unknown) {
  const id = parseId(clipId, "clip id")
  return runAction(
    "publishClip",
    async () => {
      const parsed = publishInputSchema.safeParse(input)
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Invalid publish details"
        )
      }
      const { workspace } = await requireActor()
      const clip = await clipRepository(getDb()).getOrThrow(id)
      await assertProjectAccess(clip.projectId)
      const publication = await queuePublication(
        getDb(),
        workspace,
        id,
        parsed.data
      )
      revalidatePath(`/projects/${clip.projectId}`, "layout")
      return { publicationId: publication.id }
    },
    []
  )
}

export async function retryPublicationAction(publicationId: unknown) {
  const id = parseId(publicationId, "publication id")
  return runAction(
    "retryPublication",
    async () => {
      const { workspace } = await requireActor()
      const previous = await publishingRepository(getDb()).getPublication(id)
      if (!previous) throw new AppError("NOT_FOUND", "Publication not found")
      const clip = await clipRepository(getDb()).getOrThrow(previous.clipId)
      await assertProjectAccess(clip.projectId)
      if (previous.status !== "failed") {
        throw new AppError("CONFLICT", "Only a failed publish can be retried")
      }
      const metadata = storedPublishInput(previous.metadata)
      if (metadata.publishAt && metadata.publishAt <= new Date()) {
        throw new AppError(
          "CONFLICT",
          "The scheduled time has passed. Publish again with a new time."
        )
      }
      const publication = await queuePublication(
        getDb(),
        workspace,
        clip.id,
        metadata
      )
      revalidatePath(`/projects/${clip.projectId}`, "layout")
      return { publicationId: publication.id }
    },
    []
  )
}
