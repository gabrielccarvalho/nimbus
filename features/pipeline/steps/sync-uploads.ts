import "server-only"

import { now, withTransaction } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { analyticsRepository } from "../../analytics/repository"
import {
  UPLOADS_OVERLAP_DAYS,
  type ImportedShort,
} from "../../analytics/schema"
import { importableShort, SHORT_MAX_MS } from "../../analytics/shorts"
import { jobQueue } from "../../jobs/queue"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { LIST_UNITS, nextQuotaReset, pacificDay } from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import { enqueueStatsSync } from "../../publishing/stats-service"
import { getYouTubeClient } from "../../publishing/youtube"

const DAY_MS = 86_400_000
const QUOTA_SPENT = Symbol("quota spent")

export const syncUploadsStep: JobHandler = async ({
  job,
  db,
  logger,
  reportProgress,
}) => {
  const channelId = job.payload.channelId
  if (typeof channelId !== "string") {
    throw new AppError("VALIDATION", "Uploads job is missing its channel")
  }
  const publishing = publishingRepository(db)
  const channel = await publishing.getChannelById(channelId)
  if (!channel) {
    throw new AppError("NOT_FOUND", "The YouTube channel was disconnected")
  }
  if (channel.status === "needs_reconnect" || !channel.accountId) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }

  const youtube = getYouTubeClient()
  const analytics = analyticsRepository(db)
  const booked = async <T>(
    call: (token: string) => Promise<T>
  ): Promise<T | typeof QUOTA_SPENT> => {
    const spent = await publishing.spendQuota({
      day: pacificDay(now()),
      workspaceId: channel.workspaceId,
      kind: "import",
      units: LIST_UNITS,
      budget: getEnv().YOUTUBE_DAILY_QUOTA,
    })
    if (!spent) return QUOTA_SPENT
    try {
      return await withGoogleToken(db, channel, call)
    } catch (error) {
      if (error instanceof AppError && error.cause === "quota") {
        return QUOTA_SPENT
      }
      throw error
    }
  }
  const defer = async (pageToken: string | null) => {
    await jobQueue(db).enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: pageToken ? { channelId, pageToken } : { channelId },
      runAfter: nextQuotaReset(now()),
      maxAttempts: 3,
    })
    logger.info(
      { channelId, pageToken },
      "YouTube quota spent, import deferred"
    )
  }

  let pageToken =
    typeof job.payload.pageToken === "string" ? job.payload.pageToken : null
  const playlistId = await booked((token) => youtube.uploadsPlaylist(token))
  if (playlistId === QUOTA_SPENT) return defer(pageToken)

  const known = await analytics.knownVideoIds(channelId)
  const overlapFrom = channel.uploadsSyncedAt
    ? new Date(
        channel.uploadsSyncedAt.getTime() - UPLOADS_OVERLAP_DAYS * DAY_MS
      )
    : null
  const isOld = (publishedAt: Date | null) =>
    overlapFrom !== null && publishedAt !== null && publishedAt < overlapFrom
  let detection: "probe" | "duration" | null = null
  let seen = 0

  try {
    do {
      const page = await booked((token) =>
        youtube.playlistPage(token, playlistId, pageToken)
      )
      if (page === QUOTA_SPENT) return defer(pageToken)

      const ids = page.items
        .filter((item) => !known.has(item.videoId) && !isOld(item.publishedAt))
        .map((item) => item.videoId)
      if (ids.length > 0) {
        const details = await booked((token) =>
          youtube.videoDetails(token, ids)
        )
        if (details === QUOTA_SPENT) return defer(pageToken)

        const shorts: ImportedShort[] = []
        for (const video of details) {
          let contentType: string | null = null
          if (
            detection !== "duration" &&
            video.durationMs !== null &&
            video.durationMs <= SHORT_MAX_MS
          ) {
            try {
              contentType = await withGoogleToken(db, channel, (token) =>
                youtube.videoContentType(
                  token,
                  video.videoId,
                  pacificDay(video.publishedAt),
                  pacificDay(now())
                )
              )
              detection = "probe"
            } catch (error) {
              if (!(error instanceof AppError) || error.code !== "VALIDATION") {
                throw error
              }
              logger.warn(
                { err: error, channelId },
                "content type probe failed, detecting Shorts by duration"
              )
              detection = "duration"
            }
          }
          if (
            video.durationMs !== null &&
            importableShort(video, contentType)
          ) {
            shorts.push({ ...video, durationMs: video.durationMs })
          }
        }

        const imported = await withTransaction(db, async (tx) => {
          const repo = analyticsRepository(tx)
          await repo.lockChannelJob("sync_uploads", channelId)
          return repo.insertImported(channelId, shorts)
        })
        for (const publication of imported) {
          await enqueueStatsSync(db, publication.id)
        }
        if (imported.length > 0) {
          logger.info(
            { channelId, count: imported.length },
            "imported past Shorts"
          )
        }
      }

      seen += page.items.length
      reportProgress(page.total > 0 ? (seen / page.total) * 100 : 100)
      pageToken = page.nextPageToken
      if (page.items.some((item) => isOld(item.publishedAt))) break
    } while (pageToken)
  } finally {
    if (detection) logger.info({ channelId, detection }, "Short detection path")
  }

  await analytics.markSynced(channelId, "uploadsSyncedAt", now())
}
