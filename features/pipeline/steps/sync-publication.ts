import "server-only"

import { now, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import type { Logger } from "@/lib/logger"

import { addDays } from "../../analytics/curves"
import { analyticsRepository } from "../../analytics/repository"
import { LATE_DATA_DAYS, type DailyViews } from "../../analytics/schema"
import { withGoogleToken } from "../../publishing/google-token"
import { pacificDay } from "../../publishing/quota"
import {
  publishingRepository,
  type Publication,
  type YouTubeChannel,
} from "../../publishing/repository"
import type { RetentionPoint } from "../../publishing/stats"
import { statsRepository } from "../../publishing/stats-repository"
import { getYouTubeClient, type VideoStats } from "../../publishing/youtube"

type Published = { id: string; videoId: string; publishedAt: Date }

export function publishedVideo(
  publication: Publication
): (Publication & Published) | null {
  const { videoId, publishedAt } = publication
  if (publication.status !== "published" || !videoId || !publishedAt) {
    return null
  }
  return { ...publication, videoId, publishedAt }
}

export async function syncPublication(
  db: Db,
  channel: YouTubeChannel,
  publication: Publication & Published,
  counts: VideoStats | null,
  logger: Logger
): Promise<void> {
  const publishing = publishingRepository(db)
  const { id: publicationId, videoId, publishedAt } = publication
  if (!counts) {
    await publishing.updatePublication(publicationId, { status: "removed" })
    logger.info({ publicationId, videoId }, "video is gone from YouTube")
    return
  }
  if (publication.origin === "imported") {
    if (counts.privacy === "private") {
      await publishing.updatePublication(publicationId, { status: "removed" })
      logger.info({ publicationId, videoId }, "video is private on YouTube")
      return
    }
    await publishing.updatePublication(publicationId, {
      metadata: {
        ...publication.metadata,
        title: counts.title,
        privacy: counts.privacy,
      },
    })
  }

  let analytics: {
    averageViewDurationS: number | null
    averageViewPercentage: number | null
    retention: RetentionPoint[]
  } = { averageViewDurationS: null, averageViewPercentage: null, retention: [] }
  try {
    analytics = await withGoogleToken(db, channel, (token) =>
      getYouTubeClient().videoAnalytics(
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

  await refreshDailyCurve(db, channel, publication, logger)

  await statsRepository(db).add({ publicationId, ...counts, ...analytics })
  logger.info({ publicationId, videoId, views: counts.views }, "stats synced")
}

export async function refreshDailyCurve(
  db: Db,
  channel: YouTubeChannel,
  publication: Published,
  logger: Logger
): Promise<void> {
  const analytics = analyticsRepository(db)
  const lastDay = await analytics.lastPublicationDay(publication.id)
  let daily: DailyViews[]
  try {
    daily = await withGoogleToken(db, channel, (token) =>
      getYouTubeClient().videoDaily(
        token,
        publication.videoId,
        lastDay
          ? addDays(lastDay, -LATE_DATA_DAYS)
          : pacificDay(publication.publishedAt),
        pacificDay(now())
      )
    )
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") throw error
    logger.warn(
      { err: error, publicationId: publication.id },
      "couldn't read daily views"
    )
    return
  }
  await analytics.upsertPublicationDaily(publication.id, daily)
  await publishingRepository(db).updatePublication(publication.id, {
    dailySyncedAt: now(),
  })
}
