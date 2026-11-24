import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { YOUTUBE_SCOPES } from "@/features/accounts/schema"
import { publishingRepository } from "@/features/publishing/repository"
import {
  ensureYouTubeChannel,
  syncYouTubeChannel,
} from "@/features/publishing/service"
import { YouTubeFake } from "@/features/publishing/youtube-fake"
import { AppError } from "@/lib/errors"
import { account, user, workspaces, youtubeQuotaUsage } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv({ YOUTUBE_CLIENT: "fake" })
})
afterEach(() => {
  vi.restoreAllMocks()
  env.cleanup()
})

async function seed(scope: string[], updatedAt = new Date()) {
  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  await env.db.insert(account).values({
    id: accountId,
    accountId: "g-1",
    providerId: "google",
    userId,
    accessToken: "token",
    refreshToken: "refresh",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    scope: scope.join(","),
    updatedAt,
  })
  return {
    workspaceId,
    google: { id: accountId, scope: scope.join(","), updatedAt },
  }
}

describe("ensureYouTubeChannel", () => {
  it("creates the channel once and then makes no network call", async () => {
    const myChannel = vi.spyOn(YouTubeFake.prototype, "myChannel")
    const { workspaceId, google } = await seed(YOUTUBE_SCOPES)

    const created = await ensureYouTubeChannel(env.db, workspaceId, google)
    expect(created).toMatchObject({ channelId: "UC-fake", status: "ok" })
    const again = await ensureYouTubeChannel(env.db, workspaceId, google)
    expect(again?.id).toBe(created?.id)
    expect(myChannel).toHaveBeenCalledOnce()
  })

  it("creates nothing when only the original scopes were granted", async () => {
    const myChannel = vi.spyOn(YouTubeFake.prototype, "myChannel")
    const { workspaceId, google } = await seed(YOUTUBE_SCOPES.slice(0, 2))

    expect(await ensureYouTubeChannel(env.db, workspaceId, google)).toBe(
      undefined
    )
    expect(await publishingRepository(env.db).getChannel(workspaceId)).toBe(
      undefined
    )
    expect(myChannel).not.toHaveBeenCalled()
  })

  it("skips creation when the daily quota is spent", async () => {
    const env2 = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_QUOTA: "1",
    })
    try {
      const { workspaceId, google } = await seed(YOUTUBE_SCOPES)
      await publishingRepository(env2.db).spendQuota({
        day: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
        }).format(new Date()),
        workspaceId: null,
        kind: "list",
        units: 1,
        budget: 10,
      })
      expect(await ensureYouTubeChannel(env2.db, workspaceId, google)).toBe(
        undefined
      )
    } finally {
      env2.cleanup()
    }
  })

  it("clears needs_reconnect once the account was refreshed after the row", async () => {
    const { workspaceId, google } = await seed(YOUTUBE_SCOPES)
    const repo = publishingRepository(env.db)
    const channel = await repo.upsertChannel({
      workspaceId,
      accountId: google.id,
      channelId: "UC1",
      title: "Mine",
      status: "needs_reconnect",
    })
    const reauthorized = {
      ...google,
      updatedAt: new Date(channel.updatedAt.getTime() + 1000),
    }

    const result = await ensureYouTubeChannel(env.db, workspaceId, reauthorized)
    expect(result?.status).toBe("ok")
    expect((await repo.getChannel(workspaceId))?.status).toBe("ok")
  })

  it("keeps needs_reconnect while the account is older than the row", async () => {
    const { workspaceId, google } = await seed(
      YOUTUBE_SCOPES,
      new Date(Date.now() - 60_000)
    )
    const repo = publishingRepository(env.db)
    await repo.upsertChannel({
      workspaceId,
      accountId: google.id,
      channelId: "UC1",
      title: "Mine",
      status: "needs_reconnect",
    })
    const result = await ensureYouTubeChannel(env.db, workspaceId, google)
    expect(result?.status).toBe("needs_reconnect")
  })
})

describe("syncYouTubeChannel", () => {
  it("surfaces a missing channel and does not retry or book quota again", async () => {
    const myChannel = vi
      .spyOn(YouTubeFake.prototype, "myChannel")
      .mockRejectedValue(new AppError("NOT_FOUND", "No YouTube channel"))
    const { workspaceId, google } = await seed(YOUTUBE_SCOPES)

    const first = await syncYouTubeChannel(env.db, workspaceId, google)
    expect(first).toEqual({ channel: undefined, error: "No YouTube channel" })
    const second = await syncYouTubeChannel(env.db, workspaceId, google)
    expect(second.error).toBe("No YouTube channel")
    expect(myChannel).toHaveBeenCalledOnce()
    const usage = await env.db.select().from(youtubeQuotaUsage)
    expect(usage).toHaveLength(1)
  })

  it("retries once the Google account was reauthorized", async () => {
    const myChannel = vi
      .spyOn(YouTubeFake.prototype, "myChannel")
      .mockRejectedValueOnce(new AppError("NOT_FOUND", "No YouTube channel"))
    const { workspaceId, google } = await seed(YOUTUBE_SCOPES)

    await syncYouTubeChannel(env.db, workspaceId, google)
    const result = await syncYouTubeChannel(env.db, workspaceId, {
      ...google,
      updatedAt: new Date(google.updatedAt.getTime() + 1000),
    })
    expect(result.error).toBeNull()
    expect(result.channel?.channelId).toBe("UC-fake")
    expect(myChannel).toHaveBeenCalledTimes(2)
  })
})
