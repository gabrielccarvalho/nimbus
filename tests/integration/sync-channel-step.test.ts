import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addDays } from "@/features/analytics/curves"
import { analyticsRepository } from "@/features/analytics/repository"
import {
  ANALYTICS_SYNC_EVERY_MS,
  CHANNEL_BACKFILL_DAYS,
} from "@/features/analytics/schema"
import {
  enqueueChannelSync,
  enqueueDueAnalyticsSyncs,
} from "@/features/analytics/service"
import { jobQueue } from "@/features/jobs/queue"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
import { pacificDay } from "@/features/publishing/quota"
import { publishingRepository } from "@/features/publishing/repository"
import * as youtubeModule from "@/features/publishing/youtube"
import { YouTubeFake } from "@/features/publishing/youtube-fake"
import {
  account,
  channelDaily,
  jobs,
  user,
  workspaces,
  youtubeChannels,
} from "@/lib/db/schema"

import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv
let fake: YouTubeFake

beforeEach(async () => {
  env = await createTestEnv({
    YOUTUBE_CLIENT: "fake",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  })
  fake = new YouTubeFake()
  vi.spyOn(youtubeModule, "getYouTubeClient").mockReturnValue(fake)
})
afterEach(() => {
  vi.restoreAllMocks()
  env.cleanup()
})

async function seed(channelId = "UC1") {
  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db.insert(account).values({
    id: accountId,
    accountId: `g-${channelId}`,
    providerId: "google",
    userId,
    accessToken: "stored-token",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
  })
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const repo = publishingRepository(env.db)
  const channel = await repo.upsertChannel({
    workspaceId,
    accountId,
    channelId,
    title: "Channel",
  })
  return { repo, channel }
}

const channelJobs = (type = "sync_channel") =>
  env.db
    .select()
    .from(jobs)
    .where(eq(jobs.type, type as "sync_channel"))

async function runChannel(channelId: string) {
  const job = await jobQueue(env.db).enqueue({
    type: "sync_channel",
    projectId: null,
    payload: { channelId },
    maxAttempts: 1,
  })
  await runJobs(env.db, ["sync_channel"])
  return (await jobQueue(env.db).get(job.id))!
}

const stored = (channelId: string) =>
  env.db
    .select()
    .from(channelDaily)
    .where(eq(channelDaily.channelId, channelId))

describe("sync_channel", () => {
  it("backfills 90 days on the first run and stamps the sync", async () => {
    const { channel } = await seed()
    const spy = vi.spyOn(fake, "channelDaily")
    const today = pacificDay(new Date())

    const job = await runChannel(channel.id)

    expect(job.status).toBe("succeeded")
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      addDays(today, -CHANNEL_BACKFILL_DAYS),
      today
    )
    const rows = await stored(channel.id)
    expect(new Set(rows.map((row) => row.contentType))).toEqual(
      new Set(["shorts", "long"])
    )
    const [fresh] = await env.db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.id, channel.id))
    expect(fresh!.analyticsSyncedAt).not.toBeNull()
  })

  it("restarts three days before the last stored day and overwrites them", async () => {
    const { channel } = await seed()
    const today = pacificDay(new Date())
    const last = addDays(today, -2)
    await analyticsRepository(env.db).upsertChannelDaily(channel.id, [
      {
        day: last,
        contentType: "shorts",
        views: 1,
        estimatedMinutesWatched: 0,
        averageViewDurationS: null,
        likes: 0,
        comments: 0,
        shares: 0,
        subscribersGained: 0,
        subscribersLost: 0,
      },
    ])
    const spy = vi.spyOn(fake, "channelDaily")

    await runChannel(channel.id)

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      addDays(last, -3),
      today
    )
    const [row] = await env.db
      .select()
      .from(channelDaily)
      .where(
        and(
          eq(channelDaily.channelId, channel.id),
          eq(channelDaily.day, last),
          eq(channelDaily.contentType, "shorts")
        )
      )
    expect(row!.views).toBe(300)
  })

  it("stores only the unsplit rows when the channel has no content type split", async () => {
    const { channel } = await seed()
    vi.spyOn(fake, "channelDaily").mockResolvedValue({
      split: false,
      rows: [
        {
          day: "2026-11-01",
          contentType: "other",
          views: 50,
          estimatedMinutesWatched: 10,
          averageViewDurationS: 20,
          likes: 1,
          comments: 0,
          shares: 0,
          subscribersGained: 0,
          subscribersLost: 0,
        },
      ],
    })

    await runChannel(channel.id)

    const rows = await stored(channel.id)
    expect(rows.map((row) => row.contentType)).toEqual(["other"])
  })

  it("fails with the reconnect message and makes no call when the channel needs reconnecting", async () => {
    const { repo, channel } = await seed()
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    const spy = vi.spyOn(fake, "channelDaily")

    const job = await runChannel(channel.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(RECONNECT_MESSAGE)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("enqueueDueAnalyticsSyncs", () => {
  const HOUR = 3_600_000

  it("enqueues a channel sync for a fresh channel and skips one needing reconnect", async () => {
    await seed("UC1")
    const { repo, channel: broken } = await seed("UC2")
    await repo.setChannelStatus(broken.id, "needs_reconnect")

    expect(await enqueueDueAnalyticsSyncs(env.db, new Date())).toBe(1)

    expect(await channelJobs()).toHaveLength(1)
  })

  it("enqueues an uploads sync only once uploads were synced and are stale", async () => {
    const { channel } = await seed()
    const now = new Date()
    await analyticsRepository(env.db).markSynced(
      channel.id,
      "analyticsSyncedAt",
      now
    )

    expect(await enqueueDueAnalyticsSyncs(env.db, now)).toBe(0)

    await analyticsRepository(env.db).markSynced(
      channel.id,
      "uploadsSyncedAt",
      new Date(now.getTime() - ANALYTICS_SYNC_EVERY_MS - HOUR)
    )

    expect(await enqueueDueAnalyticsSyncs(env.db, now)).toBe(1)
    expect(await channelJobs("sync_uploads")).toHaveLength(1)
    expect(await channelJobs()).toHaveLength(0)
  })

  it("never enqueues a second job while one is active", async () => {
    const { channel } = await seed()

    expect(await enqueueChannelSync(env.db, channel.id)).toBe(true)
    expect(await enqueueDueAnalyticsSyncs(env.db, new Date())).toBe(0)
    expect(await channelJobs()).toHaveLength(1)
  })
})
