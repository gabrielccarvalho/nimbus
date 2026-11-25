import "server-only"

import { now } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { jobQueue } from "../../jobs/queue"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { LIST_UNITS, nextQuotaReset, pacificDay } from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import { statsRepository } from "../../publishing/stats-repository"
import { getYouTubeClient } from "../../publishing/youtube"
import { refreshDailyCurve } from "./sync-publication"

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
  const channel = publication.channelId
    ? await publishing.getChannelById(publication.channelId)
    : undefined
  if (!channel) {
    throw new AppError("NOT_FOUND", "The YouTube channel was disconnected")
  }
  if (channel.status === "needs_reconnect" || !channel.accountId) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }

  const spent = await publishing.spendQuota({
    day: pacificDay(now()),
    workspaceId: channel.workspaceId,
    kind: "stats",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  const defer = async () => {
    await jobQueue(db).enqueue({
      type: "sync_stats",
      projectId: null,
      payload: { publicationId },
      runAfter: nextQuotaReset(now()),
      maxAttempts: 3,
    })
    logger.info({ publicationId }, "YouTube quota spent, stats sync deferred")
  }
  if (!spent) return defer()

  const youtube = getYouTubeClient()
  let counts: Awaited<ReturnType<typeof youtube.videoStats>>
  try {
    counts = await withGoogleToken(db, channel, (token) =>
      youtube.videoStats(token, videoId)
    )
  } catch (error) {
    if (error instanceof AppError && error.cause === "quota") return defer()
    throw error
  }
  if (!counts) {
    await publishing.updatePublication(publication.id, { status: "removed" })
    logger.info({ publicationId, videoId }, "video is gone from YouTube")
    return
  }
  if (publication.origin === "imported") {
    if (counts.privacy === "private") {
      await publishing.updatePublication(publication.id, { status: "removed" })
      logger.info({ publicationId, videoId }, "video is private on YouTube")
      return
    }
    await publishing.updatePublication(publication.id, {
      metadata: {
        ...publication.metadata,
        title: counts.title,
        privacy: counts.privacy,
      },
    })
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

  await refreshDailyCurve(
    db,
    channel,
    { id: publicationId, videoId, publishedAt },
    logger
  )

  await statsRepository(db).add({ publicationId, ...counts, ...analytics })
  logger.info({ publicationId, videoId, views: counts.views }, "stats synced")
}
