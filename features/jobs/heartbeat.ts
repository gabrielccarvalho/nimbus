import "server-only"

import { desc, eq, lt } from "drizzle-orm"

import type { Db } from "@/lib/db"
import { workerHeartbeats } from "@/lib/db/schema"
import type { FfmpegCapabilities } from "@/lib/media/capabilities"

export const HEARTBEAT_INTERVAL_MS = 60_000
const HEARTBEAT_STALE_MS = 3 * 60_000
const HEARTBEAT_PRUNE_MS = 24 * 60 * 60_000

export type SerializedCapabilities = Omit<
  FfmpegCapabilities,
  "filters" | "encoders"
> & { filters: string[]; encoders: string[] }

export function serializeCapabilities(
  capabilities: FfmpegCapabilities
): SerializedCapabilities {
  return {
    ...capabilities,
    filters: [...capabilities.filters].sort(),
    encoders: [...capabilities.encoders].sort(),
  }
}

export async function recordHeartbeat(
  db: Db,
  owner: string,
  capabilities: SerializedCapabilities,
  seenAt = new Date()
) {
  await db
    .insert(workerHeartbeats)
    .values({ owner, capabilities, seenAt })
    .onConflictDoUpdate({
      target: workerHeartbeats.owner,
      set: { capabilities, seenAt },
    })
}

export async function deleteHeartbeat(db: Db, owner: string) {
  await db.delete(workerHeartbeats).where(eq(workerHeartbeats.owner, owner))
}

export async function pruneHeartbeats(db: Db, now = new Date()) {
  await db
    .delete(workerHeartbeats)
    .where(
      lt(workerHeartbeats.seenAt, new Date(now.getTime() - HEARTBEAT_PRUNE_MS))
    )
}

export async function latestWorker(db: Db, now = new Date()) {
  const [row] = await db
    .select()
    .from(workerHeartbeats)
    .orderBy(desc(workerHeartbeats.seenAt))
    .limit(1)
  if (!row || now.getTime() - row.seenAt.getTime() > HEARTBEAT_STALE_MS) {
    return null
  }
  return {
    owner: row.owner,
    capabilities: row.capabilities as SerializedCapabilities,
    seenAt: row.seenAt,
  }
}
