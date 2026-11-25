import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { analyticsRepository } from "@/features/analytics/repository"
import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
import { addDays } from "@/features/analytics/curves"
import { nextQuotaReset, pacificDay } from "@/features/publishing/quota"
import {
  publishingRepository,
  type NewPublication,
} from "@/features/publishing/repository"
import {
  enqueueDueStatsSyncs,
  enqueueStatsSync,
} from "@/features/publishing/stats-service"
import { statsRepository } from "@/features/publishing/stats-repository"
import { getYouTubeClient } from "@/features/publishing/youtube"
import {
  account,
  jobs,
  publicationDaily,
  user,
  workspaces,
  youtubeChannels,
  youtubeQuotaUsage,
} from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import { runJobs } from "../utils/pipeline"
import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({
    YOUTUBE_CLIENT: "fake",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  env.cleanup()
})

const metadata = {
  title: "Clutch",
  description: "",
  tags: [],
  privacy: "private" as const,
  publishAt: null,
}

const DAY_MS = 86_400_000

async function seed(patch: Partial<NewPublication> = {}) {
  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db.insert(account).values({
    id: accountId,
    accountId: "g-1",
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
    channelId: "UC1",
    title: "Channel",
  })
  const project = await projectRepository(env.db).create({
    workspaceId,
    name: "Stream",
    settings: defaultProjectSettings,
  })
  const [clip] = await clipRepository(env.db).replaceCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
  ])
  const publication = await repo.createPublication({
    clipId: clip!.id,
    channelId: channel.id,
    metadata,
    status: "published",
    videoId: "fake-1",
    publishedAt: new Date(Date.now() - DAY_MS),
    ...patch,
  })
  return { repo, channel, project, publication, workspaceId }
}

const syncJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_stats"))

async function runSync(publicationId: string) {
  const job = await jobQueue(env.db).enqueue({
    type: "sync_stats",
    projectId: null,
    payload: { publicationId },
    maxAttempts: 1,
  })
  await runJobs(env.db, ["sync_stats"])
  return (await jobQueue(env.db).get(job.id))!
}

describe("sync_stats", () => {
  it("stores a snapshot with the numbers and retention curve", async () => {
    const { publication } = await seed()

    const job = await runSync(publication.id)

    expect(job.status).toBe("succeeded")
    const [snapshot] = await statsRepository(env.db).history(publication.id)
    expect(snapshot).toMatchObject({
      views: 1234,
      likes: 56,
      comments: 7,
      averageViewDurationS: 11.5,
      averageViewPercentage: 64.2,
    })
    expect(snapshot!.retention).toHaveLength(100)
  })

  it("syncs an imported Short and books the quota to its channel's workspace", async () => {
    const { channel, workspaceId } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-imported",
      publishedAt: new Date(Date.now() - DAY_MS),
    })

    const job = await runSync(imported.id)

    expect(job.status).toBe("succeeded")
    const [snapshot] = await statsRepository(env.db).history(imported.id)
    expect(snapshot).toMatchObject({ views: 1234 })
    expect(await env.db.select().from(youtubeQuotaUsage)).toEqual([
      expect.objectContaining({ workspaceId, kind: "stats", units: 1 }),
    ])
  })

  it("asks analytics for publish day through today in Pacific time", async () => {
    const { publication } = await seed()
    const analytics = vi.spyOn(getYouTubeClient(), "videoAnalytics")

    await runSync(publication.id)

    expect(analytics).toHaveBeenCalledWith(
      expect.any(String),
      "fake-1",
      pacificDay(publication.publishedAt!),
      pacificDay(new Date())
    )
  })

  it("marks the publication removed when the video is gone", async () => {
    const { repo, publication } = await seed({ videoId: "gone" })

    await runSync(publication.id)

    expect((await repo.getPublication(publication.id))!.status).toBe("removed")
    expect(await statsRepository(env.db).history(publication.id)).toEqual([])
  })

  it("retries after the quota reset when the stats budget is spent", async () => {
    env.cleanup()
    env = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_QUOTA: "1",
    })
    const seeded = await seed()
    await seeded.repo.spendQuota({
      day: pacificDay(new Date()),
      workspaceId: seeded.workspaceId,
      kind: "stats",
      units: 1,
      budget: 1,
    })
    const stats = vi.spyOn(getYouTubeClient(), "videoStats")

    const job = await runSync(seeded.publication.id)

    expect(job.status).toBe("succeeded")
    expect(stats).not.toHaveBeenCalled()
    expect(
      await statsRepository(env.db).history(seeded.publication.id)
    ).toEqual([])
    const next = (await syncJobs()).find((row) => row.id !== job.id)!
    expect(next.status).toBe("queued")
    expect(next.payload).toEqual({ publicationId: seeded.publication.id })
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
  })

  it("retries after the quota reset when Google reports the quota exceeded", async () => {
    const { publication } = await seed()
    vi.spyOn(getYouTubeClient(), "videoStats").mockRejectedValue(
      new AppError("EXTERNAL", "YouTube API quota exceeded", { cause: "quota" })
    )

    const job = await runSync(publication.id)

    expect(job.status).toBe("succeeded")
    expect(await statsRepository(env.db).history(publication.id)).toEqual([])
    const next = (await syncJobs()).find((row) => row.id !== job.id)!
    expect(next.status).toBe("queued")
    expect(next.payload).toEqual({ publicationId: publication.id })
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
  })

  it("fails with the reconnect message and calls Google never when the channel needs reconnecting", async () => {
    const { repo, channel, publication } = await seed()
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    const stats = vi.spyOn(getYouTubeClient(), "videoStats")

    const job = await runSync(publication.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(RECONNECT_MESSAGE)
    expect(stats).not.toHaveBeenCalled()
  })

  it("fails with the reconnect message when the channel lost its Google account", async () => {
    const { channel, publication } = await seed()
    await env.db
      .update(youtubeChannels)
      .set({ accountId: null })
      .where(eq(youtubeChannels.id, channel.id))

    const job = await runSync(publication.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(RECONNECT_MESSAGE)
  })

  it("still stores the snapshot when analytics is forbidden", async () => {
    const { publication } = await seed()
    vi.spyOn(getYouTubeClient(), "videoAnalytics").mockRejectedValue(
      new AppError("EXTERNAL", "Forbidden", { cause: "forbidden" })
    )

    await runSync(publication.id)

    const [snapshot] = await statsRepository(env.db).history(publication.id)
    expect(snapshot).toMatchObject({
      views: 1234,
      averageViewDurationS: null,
      averageViewPercentage: null,
      retention: [],
    })
  })

  it("stores the daily curve of an imported Short through two days ago", async () => {
    const { channel } = await seed()
    const publishedAt = new Date(Date.now() - 10 * DAY_MS)
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-past-1",
      publishedAt,
    })

    await runSync(imported.id)

    const rows = await env.db
      .select()
      .from(publicationDaily)
      .where(eq(publicationDaily.publicationId, imported.id))
      .orderBy(publicationDaily.day)
    expect(rows[0]!.day).toBe(pacificDay(publishedAt))
    expect(rows.at(-1)!.day).toBe(pacificDay(new Date(Date.now() - 2 * DAY_MS)))
    expect(rows[0]!.views).toBeGreaterThan(0)
  })

  it("resumes the daily curve three days before the last stored day", async () => {
    const { channel } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-past-1",
      publishedAt: new Date(Date.now() - 10 * DAY_MS),
    })
    await runSync(imported.id)
    const last = (await analyticsRepository(env.db).lastPublicationDay(
      imported.id
    ))!
    const daily = vi.spyOn(getYouTubeClient(), "videoDaily")

    await runSync(imported.id)

    expect(daily).toHaveBeenCalledWith(
      expect.any(String),
      "fake-past-1",
      addDays(last, -3),
      pacificDay(new Date())
    )
  })

  it("still stores the snapshot when the daily report is forbidden", async () => {
    const { publication } = await seed()
    vi.spyOn(getYouTubeClient(), "videoDaily").mockRejectedValue(
      new AppError("EXTERNAL", "Forbidden", { cause: "forbidden" })
    )

    const job = await runSync(publication.id)

    expect(job.status).toBe("succeeded")
    expect(await statsRepository(env.db).history(publication.id)).toHaveLength(
      1
    )
    expect(await env.db.select().from(publicationDaily)).toEqual([])
    expect(
      (await publishingRepository(env.db).getPublication(publication.id))!
        .dailySyncedAt
    ).toBeNull()
  })

  it("marks the daily curve synced even when YouTube has no days yet", async () => {
    const { publication } = await seed()
    vi.spyOn(getYouTubeClient(), "videoDaily").mockResolvedValue([])

    await runSync(publication.id)

    expect(
      (await publishingRepository(env.db).getPublication(publication.id))!
        .dailySyncedAt
    ).toBeInstanceOf(Date)
  })

  it("updates an imported Short's title from YouTube", async () => {
    const { repo, channel } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-imported",
    })
    vi.spyOn(getYouTubeClient(), "videoStats").mockResolvedValue({
      views: 10,
      likes: 1,
      comments: 0,
      title: "Renamed",
      privacy: "unlisted",
    })

    await runSync(imported.id)

    expect((await repo.getPublication(imported.id))!).toMatchObject({
      status: "published",
      metadata: { title: "Renamed", privacy: "unlisted" },
    })
  })

  it("marks an imported Short removed once it turns private", async () => {
    const { repo, channel } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-imported",
    })
    vi.spyOn(getYouTubeClient(), "videoStats").mockResolvedValue({
      views: 10,
      likes: 1,
      comments: 0,
      title: "Hidden",
      privacy: "private",
    })

    await runSync(imported.id)

    expect((await repo.getPublication(imported.id))!.status).toBe("removed")
    expect(await statsRepository(env.db).history(imported.id)).toEqual([])
  })

  it("keeps a private Nimbus publication published", async () => {
    const { repo, publication } = await seed()
    vi.spyOn(getYouTubeClient(), "videoStats").mockResolvedValue({
      views: 10,
      likes: 1,
      comments: 0,
      title: "Other title",
      privacy: "private",
    })

    await runSync(publication.id)

    expect((await repo.getPublication(publication.id))!).toMatchObject({
      status: "published",
      metadata: { title: "Clutch" },
    })
    expect(await statsRepository(env.db).history(publication.id)).toHaveLength(
      1
    )
  })

  it("does nothing for a publication that isn't published", async () => {
    const { publication } = await seed({ status: "failed" })
    const stats = vi.spyOn(getYouTubeClient(), "videoStats")

    const job = await runSync(publication.id)

    expect(job.status).toBe("succeeded")
    expect(stats).not.toHaveBeenCalled()
    expect(await statsRepository(env.db).history(publication.id)).toEqual([])
  })
})

describe("stats scheduling", () => {
  it("enqueues a due publication once while its sync is active", async () => {
    const { publication } = await seed()

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(1)
    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)

    const rows = await syncJobs()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toEqual({ publicationId: publication.id })
    expect(rows[0]!.maxAttempts).toBe(3)
    expect(rows[0]!.projectId).toBeNull()
  })

  it("enqueues one sync for concurrent requests", async () => {
    const { publication } = await seed()

    const results = await Promise.all([
      enqueueStatsSync(env.db, publication.id),
      enqueueStatsSync(env.db, publication.id),
      enqueueDueStatsSyncs(env.db, new Date()),
    ])

    expect(results.filter((r) => r === true || r === 1)).toHaveLength(1)
    expect(await syncJobs()).toHaveLength(1)
  })

  it("skips publications whose channel needs reconnecting", async () => {
    const { repo, channel } = await seed()
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)
  })

  it("enqueues never-synced imported Shorts and Nimbus Shorts past 28 days only when 28 days have passed", async () => {
    const { repo, channel, publication } = await seed({
      publishedAt: new Date(Date.now() - 60 * DAY_MS),
    })
    const imported = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-past-1",
    })
    const recent = await repo.createPublication({
      clipId: null,
      channelId: channel.id,
      metadata,
      status: "published",
      videoId: "fake-recent",
      publishedAt: new Date(Date.now() - 60 * DAY_MS),
    })
    const stats = statsRepository(env.db)
    await stats.add({
      publicationId: publication.id,
      views: 1,
      likes: 0,
      comments: 0,
      fetchedAt: new Date(Date.now() - 30 * DAY_MS),
    })
    await stats.add({
      publicationId: recent.id,
      views: 1,
      likes: 0,
      comments: 0,
      fetchedAt: new Date(Date.now() - 10 * DAY_MS),
    })
    await repo.updatePublication(recent.id, { dailySyncedAt: new Date() })

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(2)

    expect((await syncJobs()).map((row) => row.payload)).toEqual([
      { publicationId: publication.id },
    ])
    const [batch] = await env.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, "sync_stats_batch"))
    expect(batch!.payload).toEqual({
      channelId: channel.id,
      publicationIds: [imported.id],
    })
  })

  it("backfills a Short whose daily curve was never read", async () => {
    const { publication } = await seed({
      publishedAt: new Date(Date.now() - 20 * DAY_MS),
    })
    const stats = statsRepository(env.db)
    await stats.add({
      publicationId: publication.id,
      views: 1,
      likes: 0,
      comments: 0,
      fetchedAt: new Date(Date.now() - 2 * DAY_MS),
    })

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(1)
  })

  it("doesn't backfill once the daily curve has been read", async () => {
    const { repo, publication } = await seed({
      publishedAt: new Date(Date.now() - 20 * DAY_MS),
    })
    await statsRepository(env.db).add({
      publicationId: publication.id,
      views: 0,
      likes: 0,
      comments: 0,
      fetchedAt: new Date(Date.now() - 2 * DAY_MS),
    })
    await repo.updatePublication(publication.id, {
      dailySyncedAt: new Date(Date.now() - 2 * DAY_MS),
    })

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)
  })

  it("doesn't retry a failed daily read within a day", async () => {
    const { publication } = await seed({
      publishedAt: new Date(Date.now() - 20 * DAY_MS),
    })
    await statsRepository(env.db).add({
      publicationId: publication.id,
      views: 0,
      likes: 0,
      comments: 0,
      fetchedAt: new Date(Date.now() - 3_600_000),
    })

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)
  })

  it("skips publications that aren't due yet", async () => {
    await seed({ publishedAt: new Date() })
    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)
  })

  it("returns false while a sync is queued", async () => {
    const { publication } = await seed()
    expect(await enqueueStatsSync(env.db, publication.id)).toBe(true)
    expect(await enqueueStatsSync(env.db, publication.id)).toBe(false)
  })
})

describe("sync_stats_batch", () => {
  const batchJobs = () =>
    env.db.select().from(jobs).where(eq(jobs.type, "sync_stats_batch"))

  const statsUnits = async () =>
    (
      await env.db
        .select()
        .from(youtubeQuotaUsage)
        .where(eq(youtubeQuotaUsage.kind, "stats"))
    ).reduce((sum, row) => sum + row.units, 0)

  it("syncs 120 due imported Shorts in 3 batches for 3 units", async () => {
    const { channel } = await seed({ publishedAt: new Date() })
    const ids: string[] = []
    for (let i = 0; i < 120; i++) {
      const row = await insertImportedPublication(env.db, channel.id, {
        videoId: `fake-imp-${i}`,
        publishedAt: new Date(Date.now() - 40 * DAY_MS),
      })
      ids.push(row.id)
    }

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(3)
    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(0)

    const batches = await batchJobs()
    expect(
      batches.map((job) => (job.payload.publicationIds as string[]).length)
    ).toEqual(expect.arrayContaining([50, 50, 20]))
    expect(batches.every((job) => job.payload.channelId === channel.id)).toBe(
      true
    )
    expect(
      batches.flatMap((job) => job.payload.publicationIds as string[]).sort()
    ).toEqual([...ids].sort())
    expect(await syncJobs()).toEqual([])

    await runJobs(env.db, ["sync_stats_batch"])

    expect(await statsUnits()).toBe(3)
    const latest = await statsRepository(env.db).latestFor(ids)
    expect(latest.size).toBe(120)
    expect(
      await env.db
        .select()
        .from(publicationDaily)
        .where(eq(publicationDaily.publicationId, ids[0]!))
    ).not.toEqual([])
  })

  it("marks a Short missing from the response removed and syncs the rest", async () => {
    const { repo, channel } = await seed({ publishedAt: new Date() })
    const kept = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-kept",
    })
    const gone = await insertImportedPublication(env.db, channel.id, {
      videoId: "gone-1",
    })
    const batch = vi.spyOn(getYouTubeClient(), "videoStatsBatch")

    await enqueueDueStatsSyncs(env.db, new Date())
    await runJobs(env.db, ["sync_stats_batch"])

    expect(batch).toHaveBeenCalledTimes(1)
    expect((await repo.getPublication(gone.id))!.status).toBe("removed")
    expect(await statsRepository(env.db).history(gone.id)).toEqual([])
    expect((await repo.getPublication(kept.id))!.metadata.title).toBe(
      "Fake upload"
    )
    expect(await statsRepository(env.db).history(kept.id)).toHaveLength(1)
  })

  it("defers the whole batch to the quota reset when the stats budget is spent", async () => {
    env.cleanup()
    env = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_QUOTA: "1",
    })
    const { repo, channel, workspaceId } = await seed({
      publishedAt: new Date(),
    })
    const a = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-a",
    })
    const b = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-b",
    })
    await repo.spendQuota({
      day: pacificDay(new Date()),
      workspaceId,
      kind: "stats",
      units: 1,
      budget: 1,
    })
    await enqueueDueStatsSyncs(env.db, new Date())
    const [first] = await batchJobs()

    await runJobs(env.db, ["sync_stats_batch"])

    const next = (await batchJobs()).find((row) => row.id !== first!.id)!
    expect(next.status).toBe("queued")
    expect(next.payload).toEqual(first!.payload)
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
    expect(await statsRepository(env.db).latestFor([a.id, b.id])).toEqual(
      new Map()
    )
  })

  it("skips an imported Short that already has an active single sync", async () => {
    const { channel } = await seed({ publishedAt: new Date() })
    const single = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-single",
    })
    const other = await insertImportedPublication(env.db, channel.id, {
      videoId: "fake-other",
    })
    await enqueueStatsSync(env.db, single.id)

    expect(await enqueueDueStatsSyncs(env.db, new Date())).toBe(1)

    const [batch] = await batchJobs()
    expect(batch!.payload.publicationIds).toEqual([other.id])
    expect(await enqueueStatsSync(env.db, other.id)).toBe(false)
  })
})
