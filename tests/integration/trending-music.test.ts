import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearTrendingCache,
  searchMusicFor,
  trendingMusicFor,
} from "@/features/music/trending"
import { pacificDay } from "@/features/publishing/quota"
import { publishingRepository } from "@/features/publishing/repository"
import {
  FAKE_TRENDING_MUSIC,
  YouTubeFake,
} from "@/features/publishing/youtube-fake"
import { AppError } from "@/lib/errors"
import { account, user, workspaces } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv({ YOUTUBE_CLIENT: "fake" })
  clearTrendingCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  env.cleanup()
})

async function seed({ channel = true } = {}) {
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
  })
  if (channel) {
    await publishingRepository(env.db).upsertChannel({
      workspaceId,
      accountId,
      channelId: "UC1",
      title: "Mine",
      status: "ok",
    })
  }
  return workspaceId
}

describe("trendingMusicFor", () => {
  it("asks for the region's chart and caches it for every workspace", async () => {
    const trending = vi.spyOn(YouTubeFake.prototype, "trendingMusic")
    const first = await seed()
    const second = await seed()

    await expect(trendingMusicFor(env.db, first, "BR")).resolves.toEqual({
      status: "ok",
      region: "BR",
      tracks: FAKE_TRENDING_MUSIC,
    })
    await trendingMusicFor(env.db, second, "BR")
    expect(trending).toHaveBeenCalledOnce()
    expect(trending).toHaveBeenCalledWith("token", "BR", 20)

    await trendingMusicFor(env.db, second, "US")
    expect(trending).toHaveBeenCalledTimes(2)
  })

  it("needs a connected channel", async () => {
    const trending = vi.spyOn(YouTubeFake.prototype, "trendingMusic")
    const workspaceId = await seed({ channel: false })

    await expect(trendingMusicFor(env.db, workspaceId, "US")).resolves.toEqual({
      status: "no_channel",
    })
    expect(trending).not.toHaveBeenCalled()
  })

  it("makes no call once the daily quota is spent", async () => {
    const quotaEnv = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_QUOTA: "1",
    })
    try {
      const trending = vi.spyOn(YouTubeFake.prototype, "trendingMusic")
      const workspaceId = await seed()
      await publishingRepository(env.db).spendQuota({
        day: pacificDay(new Date()),
        workspaceId: null,
        kind: "list",
        units: 1,
        budget: 10,
      })

      const result = await trendingMusicFor(env.db, workspaceId, "US")
      expect(result).toMatchObject({ status: "error" })
      expect(trending).not.toHaveBeenCalled()
    } finally {
      quotaEnv.cleanup()
    }
  })

  it("reports a failure and backs off instead of retrying on every load", async () => {
    const trending = vi
      .spyOn(YouTubeFake.prototype, "trendingMusic")
      .mockRejectedValue(new AppError("EXTERNAL", "YouTube is down"))
    const workspaceId = await seed()

    const expected = { status: "error", message: "YouTube is down" }
    await expect(trendingMusicFor(env.db, workspaceId, "US")).resolves.toEqual(
      expected
    )
    await expect(trendingMusicFor(env.db, workspaceId, "US")).resolves.toEqual(
      expected
    )
    expect(trending).toHaveBeenCalledOnce()
  })
})

describe("searchMusicFor", () => {
  it("books a search's quota and caches the results per region and query", async () => {
    const search = vi.spyOn(YouTubeFake.prototype, "searchMusic")
    const workspaceId = await seed()

    const found = await searchMusicFor(env.db, workspaceId, "BR", "Flower")
    expect(found).toHaveLength(1)
    expect(search).toHaveBeenCalledWith("token", "Flower", "BR", 10)
    await searchMusicFor(env.db, workspaceId, "BR", "flower")
    expect(search).toHaveBeenCalledOnce()
    const quota = await publishingRepository(env.db).spendQuota({
      day: pacificDay(new Date()),
      workspaceId,
      kind: "list",
      units: 10_000 - 101 + 1,
      budget: 10_000,
    })
    expect(quota).toBe(false)
  })

  it("needs a connected channel", async () => {
    const workspaceId = await seed({ channel: false })
    await expect(
      searchMusicFor(env.db, workspaceId, "US", "flower")
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
