import "server-only"

import { headers } from "next/headers"

import { getDb, type Db } from "@/lib/db"

import { requireActor } from "../accounts/session"
import { musicRepository } from "./repository"
import { toSummary, type MusicTrackSummary, type TrendingMusic } from "./schema"
import { regionFromLanguages, trendingMusicFor } from "./trending"

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

export async function getTrendingMusic(): Promise<TrendingMusic> {
  const [{ workspace }, requestHeaders] = await Promise.all([
    requireActor(),
    headers(),
  ])
  return trendingMusicFor(
    getDb(),
    workspace.id,
    regionFromLanguages(requestHeaders.get("accept-language"))
  )
}
