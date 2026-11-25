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
import { getYouTubeClient, type VideoStats } from "../../publishing/youtube"
import { publishedVideo, syncPublication } from "./sync-publication"

export const syncStatsStep: JobHandler = async ({ job, db, logger }) => {
  const publicationId = job.payload.publicationId
  if (typeof publicationId !== "string") {
    throw new AppError("VALIDATION", "Stats job is missing its publication")
  }
  const publishing = publishingRepository(db)
  const found = await publishing.getPublication(publicationId)
  if (!found) throw new AppError("CANCELLED", "Publication was deleted")
  const publication = publishedVideo(found)
  if (!publication) {
    logger.warn(
      { publicationId, status: found.status },
      "publication isn't published, skipping stats sync"
    )
    return
  }
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

  let counts: VideoStats | null
  try {
    counts = await withGoogleToken(db, channel, (token) =>
      getYouTubeClient().videoStats(token, publication.videoId)
    )
  } catch (error) {
    if (error instanceof AppError && error.cause === "quota") return defer()
    throw error
  }
  await syncPublication(db, channel, publication, counts, logger)
}
