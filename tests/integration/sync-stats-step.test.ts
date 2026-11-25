import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
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
import { account, jobs, user, workspaces } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import { runJobs } from "../utils/pipeline"
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
