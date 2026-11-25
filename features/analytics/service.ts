import "server-only"

import { withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
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
