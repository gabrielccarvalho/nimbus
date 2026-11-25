import "server-only"

import { getDb, type Db } from "@/lib/db"

import { requireActor } from "../accounts/session"
import { musicRepository } from "./repository"
import type { MusicTrackSummary } from "./schema"
import { toSummary } from "./service"

export async function musicTracksFor(
  db: Db,
  workspaceId: string
): Promise<MusicTrackSummary[]> {
  const tracks = musicRepository(db)
  const [rows, counts] = await Promise.all([
    tracks.listForWorkspace(workspaceId),
    tracks.usageCounts(workspaceId),
  ])
  return rows.map((track) => toSummary(track, counts.get(track.id) ?? 0))
}

export async function getMusicLibrary(): Promise<MusicTrackSummary[]> {
  const { workspace } = await requireActor()
  return musicTracksFor(getDb(), workspace.id)
}
