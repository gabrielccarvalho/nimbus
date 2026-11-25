import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { analyticsRepository } from "@/features/analytics/repository"
import type { ChannelDay, ImportedShort } from "@/features/analytics/schema"
import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { publishingRepository } from "@/features/publishing/repository"
import {
  account,
  publications,
  user,
  workspaces,
  youtubeChannels,
} from "@/lib/db/schema"

import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seedChannel(channelId = "UC1") {
  const userId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  const accountId = crypto.randomUUID()
  await env.db.insert(account).values({
    id: accountId,
    accountId: `g-${userId}`,
    providerId: "google",
    userId,
  })
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId,
    accountId,
    channelId,
    title: "Channel",
  })
  return { channel, workspaceId }
}

async function nimbusPublication(channelId: string, videoId: string) {
  const project = await projectRepository(env.db).create({
    name: "Stream",
    settings: defaultProjectSettings,
  })
  const [clip] = await clipRepository(env.db).replaceCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
  ])
  return publishingRepository(env.db).createPublication({
    clipId: clip!.id,
    channelId,
    metadata: {
      title: "Clip",
      description: "",
      tags: [],
      privacy: "public",
      publishAt: null,
    },
    status: "published",
    videoId,
  })
}

const daily = (day: string, views: number) => ({
  day,
  views,
  estimatedMinutesWatched: views / 2,
  likes: 1,
  subscribersGained: 0,
})

const channelDay = (day: string, views: number): ChannelDay => ({
  day,
  contentType: "shorts",
  views,
  estimatedMinutesWatched: 1,
  averageViewDurationS: 12,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersGained: 0,
  subscribersLost: 0,
})

const short = (videoId: string): ImportedShort => ({
  videoId,
  title: `Short ${videoId}`,
  publishedAt: new Date("2026-09-01T12:00:00Z"),
  durationMs: 45_000,
  privacy: "public",
})

describe("analyticsRepository", () => {
  it("keeps one publication_daily row per day with the latest values", async () => {
    const { channel } = await seedChannel()
    const publication = await insertImportedPublication(env.db, channel.id)
    const analytics = analyticsRepository(env.db)

    await analytics.upsertPublicationDaily(publication.id, [
      daily("2026-10-01", 5),
      daily("2026-10-02", 3),
    ])
    await analytics.upsertPublicationDaily(publication.id, [
      daily("2026-10-02", 8),
    ])

    expect(await analytics.lastPublicationDay(publication.id)).toBe(
      "2026-10-02"
    )
    const views = await analytics.viewsBetween(
      channel.id,
      "2026-10-01",
      "2026-10-31"
    )
    expect(views.get(publication.id)).toBe(13)
    expect(await analytics.publicationDataThrough(channel.id)).toBe(
      "2026-10-02"
    )
  })

  it("keeps one channel_daily row per day and content type with the latest values", async () => {
    const { channel } = await seedChannel()
    const analytics = analyticsRepository(env.db)

    await analytics.upsertChannelDaily(channel.id, [
      channelDay("2026-10-01", 10),
      { ...channelDay("2026-10-01", 4), contentType: "long" },
    ])
    await analytics.upsertChannelDaily(channel.id, [
      channelDay("2026-10-01", 20),
    ])

    const days = await analytics.channelDays(
      channel.id,
      "2026-10-01",
      "2026-10-01"
    )
    expect(days).toHaveLength(2)
    expect(days.find((d) => d.contentType === "shorts")?.views).toBe(20)
    expect(days.find((d) => d.contentType === "long")?.views).toBe(4)
    expect(await analytics.lastChannelDay(channel.id)).toBe("2026-10-01")
  })

  it("returns the first 28 days after the Pacific publish day of the channel's published Shorts", async () => {
    const { channel } = await seedChannel()
    const other = await seedChannel("UC2")
    const analytics = analyticsRepository(env.db)
    const live = await insertImportedPublication(env.db, channel.id, {
      publishedAt: new Date("2026-10-01T18:00:00Z"),
    })
    const removed = await insertImportedPublication(env.db, channel.id, {
      status: "removed",
    })
    const elsewhere = await insertImportedPublication(env.db, other.channel.id)
    await analytics.upsertPublicationDaily(live.id, [
      daily("2026-10-01", 1),
      daily("2026-10-29", 2),
      daily("2026-10-30", 3),
    ])
    await analytics.upsertPublicationDaily(removed.id, [daily("2026-10-01", 4)])
    await analytics.upsertPublicationDaily(elsewhere.id, [
      daily("2026-10-01", 5),
    ])

    expect(await analytics.earlyDaily(channel.id)).toEqual([
      { publicationId: live.id, day: "2026-10-01", views: 1 },
      { publicationId: live.id, day: "2026-10-29", views: 2 },
    ])
  })

  it("imports each Short once and never over a Nimbus publication", async () => {
    const { channel } = await seedChannel()
    const analytics = analyticsRepository(env.db)
    await nimbusPublication(channel.id, "nimbus-1")

    const first = await analytics.insertImported(channel.id, [
      short("a"),
      short("nimbus-1"),
    ])
    expect(first.map((p) => p.videoId)).toEqual(["a"])
    expect(first[0]).toMatchObject({
      clipId: null,
      origin: "imported",
      status: "published",
      url: "https://youtube.com/shorts/a",
      durationMs: 45_000,
      metadata: {
        title: "Short a",
        description: "",
        tags: [],
        privacy: "public",
        publishAt: null,
      },
    })

    expect(await analytics.insertImported(channel.id, [short("a")])).toEqual([])
    const rows = await env.db
      .select()
      .from(publications)
      .where(eq(publications.channelId, channel.id))
    expect(rows).toHaveLength(2)
    expect(await analytics.knownVideoIds(channel.id)).toEqual(
      new Set(["a", "nimbus-1"])
    )
  })

  it("reports a channel job as active only while one is queued or running for that channel", async () => {
    const { channel } = await seedChannel()
    const other = await seedChannel("UC2")
    const analytics = analyticsRepository(env.db)
    expect(await analytics.channelJobActive("sync_uploads", channel.id)).toBe(
      false
    )

    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId: channel.id },
    })
    expect(await analytics.channelJobActive("sync_uploads", channel.id)).toBe(
      true
    )
    expect(
      await analytics.channelJobActive("sync_uploads", other.channel.id)
    ).toBe(false)
    expect(await analytics.channelJobActive("sync_channel", channel.id)).toBe(
      false
    )

    await queue.lease({ owner: "w", leaseMs: 60_000 })
    expect(await analytics.channelJobActive("sync_uploads", channel.id)).toBe(
      true
    )
    await queue.complete(job.id, "w")
    expect(await analytics.channelJobActive("sync_uploads", channel.id)).toBe(
      false
    )
    expect(
      (await analytics.latestChannelJob("sync_uploads", channel.id))?.id
    ).toBe(job.id)
  })

  it("lists only connected channels as due and records sync times", async () => {
    const ok = await seedChannel("UC1")
    const reconnect = await seedChannel("UC2")
    const unlinked = await seedChannel("UC3")
    const publishing = publishingRepository(env.db)
    await publishing.setChannelStatus(reconnect.channel.id, "needs_reconnect")
    await env.db
      .update(youtubeChannels)
      .set({ accountId: null })
      .where(eq(youtubeChannels.id, unlinked.channel.id))
    const analytics = analyticsRepository(env.db)

    expect((await analytics.dueChannels()).map((c) => c.id)).toEqual([
      ok.channel.id,
    ])

    const at = new Date("2026-11-20T00:00:00Z")
    await analytics.markSynced(ok.channel.id, "uploadsSyncedAt", at)
    const channel = await publishing.getChannelById(ok.channel.id)
    expect(channel?.uploadsSyncedAt).toEqual(at)
    expect(channel?.analyticsSyncedAt).toBeNull()
  })

  it("deletes a workspace's imported publications with it", async () => {
    const { channel, workspaceId } = await seedChannel()
    const publication = await insertImportedPublication(env.db, channel.id)
    await analyticsRepository(env.db).upsertPublicationDaily(publication.id, [
      daily("2026-10-01", 1),
    ])

    await env.db.delete(workspaces).where(eq(workspaces.id, workspaceId))

    expect(await env.db.select().from(publications)).toEqual([])
  })
})
