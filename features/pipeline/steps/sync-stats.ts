import "server-only"

import { now } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { clipRepository } from "../../clips/repository"
import { jobQueue } from "../../jobs/queue"
import type { JobHandler } from "../../jobs/worker-loop"
import { projectRepository } from "../../projects/repository"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { LIST_UNITS, nextQuotaReset, pacificDay } from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import { statsRepository } from "../../publishing/stats-repository"
import { getYouTubeClient } from "../../publishing/youtube"

export const syncStatsStep: JobHandler = async ({ job, db, logger }) => {
  const publicationId = job.payload.publicationId
  if (typeof publicationId !== "string") {
    throw new AppError("VALIDATION", "Stats job is missing its publication")
  }
  const publishing = publishingRepository(db)
  const publication = await publishing.getPublication(publicationId)
  if (!publication) throw new AppError("CANCELLED", "Publication was deleted")
  if (
    publication.status !== "published" ||
    !publication.videoId ||
    !publication.publishedAt
  ) {
    logger.warn(
      { publicationId, status: publication.status },
      "publication isn't published, skipping stats sync"
    )
    return
  }
  const { videoId, publishedAt } = publication
  const clip = await clipRepository(db).get(publication.clipId)
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

  const spent = await publishing.spendQuota({
    day: pacificDay(now()),
    workspaceId: project.workspaceId,
    kind: "stats",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  if (!spent) {
    await jobQueue(db).enqueue({
      type: "sync_stats",
      projectId: null,
      payload: { publicationId },
      runAfter: nextQuotaReset(now()),
      maxAttempts: 3,
    })
    logger.info({ publicationId }, "YouTube quota spent, stats sync deferred")
    return
  }

  const youtube = getYouTubeClient()
  const counts = await withGoogleToken(db, channel, (token) =>
    youtube.videoStats(token, videoId)
  )
  if (!counts) {
    await publishing.updatePublication(publication.id, { status: "removed" })
    logger.info({ publicationId, videoId }, "video is gone from YouTube")
    return
  }

  let analytics: Awaited<ReturnType<typeof youtube.videoAnalytics>> = {
    averageViewDurationS: null,
    averageViewPercentage: null,
    retention: [],
  }
  try {
    analytics = await withGoogleToken(db, channel, (token) =>
      youtube.videoAnalytics(
        token,
        videoId,
        pacificDay(publishedAt),
        pacificDay(now())
      )
    )
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") throw error
    logger.warn({ err: error, publicationId }, "couldn't read video analytics")
  }

  await statsRepository(db).add({ publicationId, ...counts, ...analytics })
  logger.info({ publicationId, videoId, views: counts.views }, "stats synced")
}
