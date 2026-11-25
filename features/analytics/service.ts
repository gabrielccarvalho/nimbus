import "server-only"

import { withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { pacificDay } from "../publishing/quota"
import { statsRepository } from "../publishing/stats-repository"
import { cumulativeViews } from "./curves"
import { analyticsRepository } from "./repository"
import { ANALYTICS_SYNC_EVERY_MS, type ChannelJobType } from "./schema"

async function enqueueChannelJob(
  db: Db,
  type: ChannelJobType,
  channelId: string
): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const repo = analyticsRepository(tx)
    await repo.lockChannelJob(type, channelId)
    if (await repo.channelJobActive(type, channelId)) return false
    await jobQueue(tx).enqueue({
      type,
      projectId: null,
      payload: { channelId },
      maxAttempts: 3,
    })
    return true
  })
}

export const enqueueUploadsSync = (db: Db, channelId: string) =>
  enqueueChannelJob(db, "sync_uploads", channelId)

export const enqueueChannelSync = (db: Db, channelId: string) =>
  enqueueChannelJob(db, "sync_channel", channelId)

export async function enqueueDueAnalyticsSyncs(
  db: Db,
  now: Date
): Promise<number> {
  const stale = (syncedAt: Date) =>
    now.getTime() - syncedAt.getTime() > ANALYTICS_SYNC_EVERY_MS
  let enqueued = 0
  for (const channel of await analyticsRepository(db).dueChannels()) {
    if (!channel.analyticsSyncedAt || stale(channel.analyticsSyncedAt)) {
      if (await enqueueChannelSync(db, channel.id)) enqueued++
    }
    if (channel.uploadsSyncedAt && stale(channel.uploadsSyncedAt)) {
      if (await enqueueUploadsSync(db, channel.id)) enqueued++
    }
  }
  return enqueued
}

export async function channelCurves(
  db: Db,
  channelId: string
): Promise<{ dataThrough: string | null; curves: Map<string, number[]> }> {
  const analytics = analyticsRepository(db)
  const [dataThrough, daily, rows] = await Promise.all([
    analytics.publicationDataThrough(channelId),
    analytics.earlyDaily(channelId),
    statsRepository(db).forChannel(channelId),
  ])
  const curves = new Map<string, number[]>()
  if (!dataThrough) return { dataThrough, curves }
  const byPublication = Map.groupBy(daily, (row) => row.publicationId)
  for (const { publication, latest } of rows) {
    if (!latest || !publication.publishedAt) continue
    curves.set(
      publication.id,
      cumulativeViews(
        byPublication.get(publication.id) ?? [],
        pacificDay(publication.publishedAt),
        dataThrough
      )
    )
  }
  return { dataThrough, curves }
}
