import "server-only"

import { withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { STATS_BATCH_SIZE } from "../jobs/schema"
import { dailyBackfillDue, statsSyncDue, YOUTUBE_DATA_TTL_MS } from "./stats"
import { statsRepository } from "./stats-repository"

export async function enqueueStatsSync(
  db: Db,
  publicationId: string
): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const stats = statsRepository(tx)
    await stats.lockSync(publicationId)
    if (await stats.syncActive(publicationId)) return false
    await jobQueue(tx).enqueue({
      type: "sync_stats",
      projectId: null,
      payload: { publicationId },
      maxAttempts: 3,
    })
    return true
  })
}

export async function enqueueStatsBatches(
  db: Db,
  channelId: string,
  publicationIds: string[]
): Promise<number> {
  if (publicationIds.length === 0) return 0
  return withTransaction(db, async (tx) => {
    const stats = statsRepository(tx)
    const ids = [...new Set(publicationIds)].sort()
    for (const id of ids) await stats.lockSync(id)
    const active = await stats.activeSyncIds()
    const fresh = ids.filter((id) => !active.has(id))
    let enqueued = 0
    for (let at = 0; at < fresh.length; at += STATS_BATCH_SIZE) {
      await jobQueue(tx).enqueue({
        type: "sync_stats_batch",
        projectId: null,
        payload: {
          channelId,
          publicationIds: fresh.slice(at, at + STATS_BATCH_SIZE),
        },
        maxAttempts: 3,
      })
      enqueued++
    }
    return enqueued
  })
}

export async function enqueueDueStatsSyncs(db: Db, now: Date): Promise<number> {
  const candidates = await statsRepository(db).dueCandidates()
  const imported = new Map<string, string[]>()
  let enqueued = 0
  for (const { publication, lastFetchedAt } of candidates) {
    if (
      !publication.publishedAt ||
      !publication.channelId ||
      !(
        statsSyncDue(
          { publishedAt: publication.publishedAt, origin: publication.origin },
          lastFetchedAt,
          now
        ) ||
        (!publication.dailySyncedAt &&
          dailyBackfillDue(publication.publishedAt, lastFetchedAt, now))
      )
    ) {
      continue
    }
    if (publication.origin === "imported") {
      imported.set(publication.channelId, [
        ...(imported.get(publication.channelId) ?? []),
        publication.id,
      ])
    } else if (await enqueueStatsSync(db, publication.id)) {
      enqueued++
    }
  }
  for (const [channelId, ids] of imported) {
    enqueued += await enqueueStatsBatches(db, channelId, ids)
  }
  return enqueued
}

export async function sweepStaleYouTubeData(
  db: Db,
  now: Date
): Promise<{ snapshots: number; titles: number }> {
  const cutoff = new Date(now.getTime() - YOUTUBE_DATA_TTL_MS)
  const stats = statsRepository(db)
  const titles = await stats.blankStaleImportedTitles(cutoff)
  const snapshots = await stats.deleteSnapshotsBefore(cutoff)
  return { snapshots, titles }
}
