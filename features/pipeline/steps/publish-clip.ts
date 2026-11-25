import "server-only"

import { now, withTransaction } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { getStorage } from "@/lib/storage"

import { clipRepository } from "../../clips/repository"
import { jobQueue } from "../../jobs/queue"
import type { JobHandler } from "../../jobs/worker-loop"
import { assetRepository, projectRepository } from "../../projects/repository"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { storedPublishInput, videoResource } from "../../publishing/metadata"
import {
  nextQuotaReset,
  pacificDay,
  UPLOAD_UNITS,
} from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import type { PublicationStatus } from "../../publishing/schema"
import { releaseRenderAsset } from "../../publishing/service"
import { getYouTubeClient } from "../../publishing/youtube"
import { transcriptRepository } from "../../transcription/repository"

const RUNNABLE: ReadonlySet<PublicationStatus> = new Set([
  "queued",
  "waiting_quota",
  "uploading",
])

const hasCause = (error: unknown, cause: string) =>
  error instanceof AppError && error.cause === cause

export const publishClipStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const publicationId = job.payload.publicationId
  if (typeof publicationId !== "string") {
    throw new AppError("VALIDATION", "Publish job is missing its publication")
  }
  const publishing = publishingRepository(db)
  const publication = await publishing.getPublication(publicationId)
  if (!publication) throw new AppError("CANCELLED", "Publication was deleted")
  if (!publication.clipId) {
    throw new AppError("CANCELLED", "Imported Shorts can't be published")
  }
  if (!RUNNABLE.has(publication.status)) {
    logger.warn(
      { publicationId, status: publication.status },
      "publication isn't waiting to upload, skipping"
    )
    return
  }
  const clips = clipRepository(db)
  const clip = await clips.get(publication.clipId)
  if (!clip) throw new AppError("CANCELLED", "Clip was deleted")
  const project = await projectRepository(db).get(clip.projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  const channel = project.workspaceId
    ? await publishing.getChannel(project.workspaceId)
    : undefined
  if (!channel || channel.id !== publication.channelId) {
    throw new AppError("NOT_FOUND", "The YouTube channel was disconnected")
  }
  if (channel.status === "needs_reconnect") {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }

  const assets = assetRepository(db)
  const storage = getStorage()
  const asset = publication.renderAssetId
    ? await assets.get(publication.renderAssetId)
    : undefined
  const bytes = asset && (await storage.stat(asset.storageKey))?.bytes
  if (!asset || !bytes) {
    throw new AppError(
      "NOT_FOUND",
      "The rendered clip is missing. Render it again to publish it."
    )
  }

  const waitForQuota = async () => {
    await withTransaction(db, async (tx) => {
      await publishingRepository(tx).updatePublication(publication.id, {
        status: "waiting_quota",
      })
      await jobQueue(tx).enqueue({
        type: "publish_clip",
        projectId: project.id,
        payload: { publicationId },
        runAfter: nextQuotaReset(now()),
      })
    })
    logger.info({ publicationId }, "YouTube quota spent, waiting for reset")
  }

  if (!publication.uploadUri) {
    const spent = await publishing.spendQuota({
      day: pacificDay(now()),
      workspaceId: project.workspaceId,
      kind: "upload",
      units: UPLOAD_UNITS,
      budget: getEnv().YOUTUBE_DAILY_UPLOADS,
    })
    if (!spent) return waitForQuota()
  }

  await publishing.updatePublication(publication.id, {
    status: "uploading",
    error: null,
  })
  const youtube = getYouTubeClient()
  const authorized = <T>(call: (token: string) => Promise<T>) =>
    withGoogleToken(db, channel, call)

  const upload = async () => {
    let fresh = false
    let uploadUri = publication.uploadUri
    if (!uploadUri) {
      const transcript = await transcriptRepository(db).get(project.id)
      const body = videoResource(
        storedPublishInput(publication.metadata),
        transcript?.language ?? project.settings.language
      )
      uploadUri = await authorized((t) => youtube.startUpload(t, body, bytes))
      await publishing.updatePublication(publication.id, { uploadUri })
      fresh = true
    }
    const session = uploadUri
    return authorized(async (t) => {
      const offset = fresh ? 0 : await youtube.uploadedBytes(t, session, bytes)
      fresh = false
      if (typeof offset !== "number") return offset
      // Every byte is there but no video yet. An empty range is invalid, so
      // fail retryably and ask again on the next attempt.
      if (offset >= bytes) {
        throw new AppError("EXTERNAL", "YouTube is still finishing the upload")
      }
      return youtube.uploadFrom(
        t,
        session,
        storage.resolve(asset.storageKey),
        offset,
        bytes,
        signal,
        (sent) => reportProgress((sent / bytes) * 100)
      )
    })
  }

  let video: { videoId: string }
  try {
    video = await upload()
  } catch (error) {
    if (!hasCause(error, "quota")) throw error
    return waitForQuota()
  }
  const { videoId } = video

  const published = await publishing.publishUploaded(publication, {
    status: "published",
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
    publishedAt: now(),
    error: null,
  })
  await releaseRenderAsset(db, published)
  logger.info({ publicationId, videoId, bytes }, "clip published")
}
