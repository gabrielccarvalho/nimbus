import "server-only"

import { YOUTUBE_SCOPES } from "@/features/accounts/schema"
import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"

import { accessTokenForAccount } from "./google-token"
import { LIST_UNITS, pacificDay } from "./quota"
import { publishingRepository, type YouTubeChannel } from "./repository"
import { getYouTubeClient } from "./youtube"

export async function ensureYouTubeChannel(
  db: Db,
  workspaceId: string,
  googleAccount: { id: string; scope: string | null; updatedAt: Date }
): Promise<YouTubeChannel | undefined> {
  if (!YOUTUBE_SCOPES.every((s) => googleAccount.scope?.includes(s))) {
    return undefined
  }

  const repo = publishingRepository(db)
  const existing = await repo.getChannel(workspaceId)
  if (existing) {
    if (
      existing.status === "needs_reconnect" &&
      googleAccount.updatedAt > existing.updatedAt
    ) {
      await repo.setChannelStatus(existing.id, "ok")
      return { ...existing, status: "ok" }
    }
    return existing
  }

  const booked = await repo.spendQuota({
    day: pacificDay(new Date()),
    workspaceId,
    kind: "list",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  if (!booked) return undefined

  const token = await accessTokenForAccount(db, googleAccount.id)
  const info = await getYouTubeClient().myChannel(token)
  return repo.upsertChannel({
    workspaceId,
    accountId: googleAccount.id,
    channelId: info.channelId,
    title: info.title,
    thumbnailUrl: info.thumbnailUrl,
    status: "ok",
  })
}

export async function syncYouTubeChannel(
  db: Db,
  workspaceId: string,
  googleAccount: { id: string; scope: string | null; updatedAt: Date }
): Promise<YouTubeChannel | undefined> {
  try {
    return await ensureYouTubeChannel(db, workspaceId, googleAccount)
  } catch {
    return publishingRepository(db).getChannel(workspaceId)
  }
}
