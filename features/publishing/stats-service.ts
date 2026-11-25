import "server-only"

import type { Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { statsSyncDue } from "./stats"
import { statsRepository } from "./stats-repository"

export async function enqueueStatsSync(
  db: Db,
  publicationId: string
): Promise<boolean> {
  if (await statsRepository(db).syncActive(publicationId)) return false
  await jobQueue(db).enqueue({
    type: "sync_stats",
    projectId: null,
    payload: { publicationId },
    maxAttempts: 3,
  })
  return true
}

export async function enqueueDueStatsSyncs(db: Db, now: Date): Promise<number> {
  const candidates = await statsRepository(db).dueCandidates()
  let enqueued = 0
  for (const { publication, lastFetchedAt } of candidates) {
    if (
      publication.publishedAt &&
      statsSyncDue(publication.publishedAt, lastFetchedAt, now) &&
      (await enqueueStatsSync(db, publication.id))
    ) {
      enqueued++
    }
  }
  return enqueued
}
