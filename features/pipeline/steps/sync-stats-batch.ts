import "server-only"

import { now } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { jobQueue } from "../../jobs/queue"
import { jobPayloadSchemas } from "../../jobs/schema"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  RECONNECT_MESSAGE,
  withGoogleToken,
} from "../../publishing/google-token"
import { LIST_UNITS, nextQuotaReset, pacificDay } from "../../publishing/quota"
import { publishingRepository } from "../../publishing/repository"
import { getYouTubeClient, type VideoStats } from "../../publishing/youtube"
import { publishedVideo, syncPublication } from "./sync-publication"

export const syncStatsBatchStep: JobHandler = async ({
  job,
  db,
  logger,
  reportProgress,
}) => {
  const parsed = jobPayloadSchemas.sync_stats_batch.safeParse(job.payload)
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Stats batch is missing its Shorts")
  }
  const { channelId, publicationIds } = parsed.data
  const publishing = publishingRepository(db)
  const channel = await publishing.getChannelById(channelId)
  if (!channel) {
    throw new AppError("NOT_FOUND", "The YouTube channel was disconnected")
  }
  if (channel.status === "needs_reconnect" || !channel.accountId) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }
  const batch = (await publishing.getPublications(publicationIds)).flatMap(
    (row) => {
      const publication = publishedVideo(row)
      return publication?.channelId === channelId ? [publication] : []
    }
  )
  if (batch.length === 0) return

  const spent = await publishing.spendQuota({
    day: pacificDay(now()),
    workspaceId: channel.workspaceId,
    kind: "stats",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  const defer = async () => {
    await jobQueue(db).enqueue({
      type: "sync_stats_batch",
      projectId: null,
      payload: { channelId, publicationIds },
      runAfter: nextQuotaReset(now()),
      maxAttempts: 3,
    })
    logger.info(
      { channelId, count: publicationIds.length },
      "YouTube quota spent, stats batch deferred"
    )
  }
  if (!spent) return defer()

  let counts: Map<string, VideoStats>
  try {
    counts = await withGoogleToken(db, channel, (token) =>
      getYouTubeClient().videoStatsBatch(
        token,
        batch.map((publication) => publication.videoId)
      )
    )
  } catch (error) {
    if (error instanceof AppError && error.cause === "quota") return defer()
    throw error
  }
  for (const [index, publication] of batch.entries()) {
    await syncPublication(
      db,
      channel,
      publication,
      counts.get(publication.videoId) ?? null,
      logger
    )
    reportProgress(((index + 1) / batch.length) * 100)
  }
}
