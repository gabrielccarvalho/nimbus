import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { account } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { publishingRepository, type YouTubeChannel } from "./repository"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const FRESH_FOR_MS = 60_000

export const RECONNECT_MESSAGE =
  "Reconnect YouTube in Settings › Connected channels"

export async function googleAccessToken(
  db: Db,
  channel: YouTubeChannel,
  opts: { force?: boolean } = {}
): Promise<string> {
  if (!channel.accountId) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }
  return accessTokenForAccount(db, channel.accountId, {
    force: opts.force,
    onRevoked: () =>
      publishingRepository(db).setChannelStatus(channel.id, "needs_reconnect"),
  })
}

export async function accessTokenForAccount(
  db: Db,
  accountId: string,
  opts: { force?: boolean; onRevoked?: () => Promise<void> } = {}
): Promise<string> {
  const [row] = await db.select().from(account).where(eq(account.id, accountId))
  if (!row?.refreshToken) {
    throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
  }

  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0
  if (
    !opts.force &&
    row.accessToken &&
    expiresAt - Date.now() >= FRESH_FOR_MS
  ) {
    return row.accessToken
  }

  const env = getEnv()
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      "DEPENDENCY_MISSING",
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to refresh YouTube access"
    )
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    if (body.error === "invalid_grant") {
      await opts.onRevoked?.()
      throw new AppError("UNAUTHORIZED", RECONNECT_MESSAGE)
    }
    throw new AppError(
      "EXTERNAL",
      `Google token refresh failed (${response.status})`
    )
  }

  const token = (await response.json()) as {
    access_token: string
    expires_in: number
    refresh_token?: string
  }
  await db
    .update(account)
    .set({
      accessToken: token.access_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      updatedAt: now(),
    })
    .where(eq(account.id, row.id))
  return token.access_token
}
