import "server-only"

import { now } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { addDays } from "../../analytics/curves"
import { analyticsRepository } from "../../analytics/repository"
import { CHANNEL_BACKFILL_DAYS, LATE_DATA_DAYS } from "../../analytics/schema"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { pacificDay } from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import { getYouTubeClient } from "../../publishing/youtube"

export const syncChannelStep: JobHandler = async ({ job, db, logger }) => {
  const channelId = job.payload.channelId
  if (typeof channelId !== "string") {
    throw new AppError("VALIDATION", "Channel sync is missing its channel")
  }
  const channel = await publishingRepository(db).getChannelById(channelId)
  if (!channel) {
    throw new AppError("NOT_FOUND", "The YouTube channel was disconnected")
  }
  if (channel.status === "needs_reconnect" || !channel.accountId) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }

  const analytics = analyticsRepository(db)
  const startedAt = job.startedAt ?? now()
  const today = pacificDay(startedAt)
  const last = await analytics.lastChannelDay(channelId)
  const from = last
    ? addDays(last, -LATE_DATA_DAYS)
    : addDays(today, -CHANNEL_BACKFILL_DAYS)

  const { split, rows } = await withGoogleToken(db, channel, (token) =>
    getYouTubeClient().channelDaily(token, from, today)
  )
  await analytics.replaceChannelDays(channelId, from, today, rows)
  await analytics.markSynced(channelId, "analyticsSyncedAt", startedAt)
  logger.info(
    { channelId, from, to: today, rows: rows.length, split },
    "synced channel analytics"
  )
}
