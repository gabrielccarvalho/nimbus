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
  type YouTubeChannel,
} from "../../publishing/repository"
import { getYouTubeClient } from "../../publishing/youtube"

type Published = { id: string; videoId: string; publishedAt: Date }

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
