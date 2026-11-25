import "server-only"

import { withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { statsSyncDue } from "./stats"
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

export async function enqueueDueStatsSyncs(db: Db, now: Date): Promise<number> {
  const candidates = await statsRepository(db).dueCandidates()
  let enqueued = 0
  for (const { publication, lastFetchedAt } of candidates) {
    if (
      publication.publishedAt &&
      statsSyncDue(
        { publishedAt: publication.publishedAt, origin: publication.origin },
        lastFetchedAt,
        now
      ) &&
      (await enqueueStatsSync(db, publication.id))
    ) {
      enqueued++
    }
  }
  return enqueued
}
