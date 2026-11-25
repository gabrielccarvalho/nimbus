"use server"

import { revalidatePath } from "next/cache"

import { assertProjectAccess, requireActor } from "../accounts/session"
import { clipRepository } from "../clips/repository"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"

import { RECONNECT_MESSAGE } from "./google-token"
import { storedPublishInput } from "./metadata"
import { publishingRepository } from "./repository"
import { publishInputSchema } from "./schema"
import { queuePublication } from "./service"
import { statsRepository } from "./stats-repository"
import { enqueueStatsSync } from "./stats-service"

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

export async function refreshStatsAction(publicationId: unknown) {
  const id = parseId(publicationId, "publication id")
  return runAction(
    "refreshStats",
    async () => {
      const { workspace } = await requireActor()
      const repo = publishingRepository(getDb())
      const publication = await repo.getPublication(id)
      if (!publication) throw new AppError("NOT_FOUND", "Publication not found")
      const clip = await clipRepository(getDb()).getOrThrow(publication.clipId)
      await assertProjectAccess(clip.projectId)
      const channel = await repo.getChannel(workspace.id)
      if (
        !channel ||
        channel.id !== publication.channelId ||
        channel.status !== "ok"
      ) {
        throw new AppError("CONFLICT", RECONNECT_MESSAGE)
      }
      if (!(await enqueueStatsSync(getDb(), publication.id))) {
        const refreshing = await statsRepository(getDb()).syncActive(
          publication.id,
          { dueBy: new Date() }
        )
        throw new AppError(
          "CONFLICT",
          refreshing
            ? "Stats are already refreshing"
            : "Stats will refresh after YouTube's daily quota resets."
        )
      }
      revalidatePath(`/projects/${clip.projectId}`, "layout")
      return { publicationId: publication.id }
    },
    []
  )
}
