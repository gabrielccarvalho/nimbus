import "server-only"

import { YOUTUBE_SCOPES } from "@/features/accounts/schema"
import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

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

const FAILURE_BACKOFF_MS = 10 * 60_000
const failures = new Map<
  string,
  { at: number; message: string; accountUpdatedAt: number }
>()

type GoogleAccount = { id: string; scope: string | null; updatedAt: Date }

export async function syncYouTubeChannel(
  db: Db,
  workspaceId: string,
  googleAccount: GoogleAccount
): Promise<{ channel: YouTubeChannel | undefined; error: string | null }> {
  const repo = publishingRepository(db)
  const failure = failures.get(workspaceId)
  if (
    failure &&
    failure.accountUpdatedAt === googleAccount.updatedAt.getTime() &&
    Date.now() - failure.at < FAILURE_BACKOFF_MS
  ) {
    return {
      channel: await repo.getChannel(workspaceId),
      error: failure.message,
    }
  }

  try {
    const channel = await ensureYouTubeChannel(db, workspaceId, googleAccount)
    failures.delete(workspaceId)
    return { channel, error: null }
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Could not reach YouTube. Try again in a few minutes."
    logger.warn(
      {
        workspaceId,
        code: error instanceof AppError ? error.code : undefined,
        message,
      },
      "YouTube channel sync failed"
    )
    failures.set(workspaceId, {
      at: Date.now(),
      message,
      accountUpdatedAt: googleAccount.updatedAt.getTime(),
    })
    return { channel: await repo.getChannel(workspaceId), error: message }
  }
}
