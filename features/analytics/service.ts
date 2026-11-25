import "server-only"

import { withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { analyticsRepository } from "./repository"

export async function enqueueUploadsSync(
  db: Db,
  channelId: string
): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const repo = analyticsRepository(tx)
    await repo.lockChannelJob("sync_uploads", channelId)
    if (await repo.channelJobActive("sync_uploads", channelId)) return false
    await jobQueue(tx).enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId },
      maxAttempts: 3,
    })
    return true
  })
}
