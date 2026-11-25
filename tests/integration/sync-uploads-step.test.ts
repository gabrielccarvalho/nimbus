import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
import { nextQuotaReset } from "@/features/publishing/quota"
import { publishingRepository } from "@/features/publishing/repository"
import * as youtubeModule from "@/features/publishing/youtube"
import {
  FAKE_PAST_UPLOADS,
  YouTubeFake,
} from "@/features/publishing/youtube-fake"
import {
  account,
  jobs,
  publications,
  user,
  workspaces,
  youtubeChannels,
  youtubeQuotaUsage,
} from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

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

const DAY_MS = 86_400_000

async function seed() {
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
  return { repo, channel, workspaceId }
}

const imported = () =>
  env.db.select().from(publications).where(eq(publications.origin, "imported"))

const statsJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_stats"))

const batchJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_stats_batch"))

const uploadJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_uploads"))

async function importUnits() {
  const rows = await env.db
    .select()
    .from(youtubeQuotaUsage)
    .where(eq(youtubeQuotaUsage.kind, "import"))
  return rows.reduce((sum, row) => sum + row.units, 0)
}

async function runUploads(channelId: string) {
  const job = await jobQueue(env.db).enqueue({
    type: "sync_uploads",
    projectId: null,
    payload: { channelId },
    maxAttempts: 1,
  })
  await runJobs(env.db, ["sync_uploads"])
  return (await jobQueue(env.db).get(job.id))!
}

describe("sync_uploads", () => {
  it("imports the channel's past Shorts and skips long-form uploads", async () => {
    const { repo, channel } = await seed()

    const job = await runUploads(channel.id)

    expect(job.status).toBe("succeeded")
    const rows = await imported()
    expect(rows.map((row) => row.videoId).sort()).toEqual([
      "fake-past-1",
      "fake-past-2",
      "fake-past-3",
    ])
    for (const row of rows) {
      const past = FAKE_PAST_UPLOADS.find((u) => u.id === row.videoId)!
      expect(row).toMatchObject({
        status: "published",
        clipId: null,
        channelId: channel.id,
        durationMs: past.durationS * 1000,
        metadata: expect.objectContaining({ title: past.title }),
      })
      expect(
        Math.abs(
          row.publishedAt!.getTime() - (Date.now() - past.daysAgo * DAY_MS)
        )
      ).toBeLessThan(60_000)
    }
    expect(
      (await repo.getChannelById(channel.id))!.uploadsSyncedAt
    ).toBeInstanceOf(Date)
  })

  it("doesn't import a video Nimbus already published", async () => {
    const { repo, channel, workspaceId } = await seed()
    const { videoId } = await fake.uploadFrom(
      "token",
      "https://fake.youtube.test/upload/1",
      "clip.mp4",
      0,
      10,
      new AbortController().signal,
      () => {}
    )
    const project = await projectRepository(env.db).create({
      workspaceId,
      name: "Stream",
      settings: defaultProjectSettings,
    })
    const [clip] = await clipRepository(env.db).replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
    ])
    await repo.createPublication({
      clipId: clip!.id,
      channelId: channel.id,
      metadata: {
        title: "Clutch",
        description: "",
        tags: [],
        privacy: "public",
        publishAt: null,
      },
      status: "published",
      videoId,
      publishedAt: new Date(),
    })

    await runUploads(channel.id)

    const rows = await env.db
      .select()
      .from(publications)
      .where(eq(publications.videoId, videoId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.origin).toBe("nimbus")
    expect(await imported()).toHaveLength(3)
  })

  it("queues one stats batch for the new imports and nothing on a second run", async () => {
    const { channel } = await seed()

    await runUploads(channel.id)
    const rows = await imported()
    const queued = await batchJobs()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.payload).toEqual({
      channelId: channel.id,
      publicationIds: expect.any(Array),
    })
    expect((queued[0]!.payload.publicationIds as string[]).sort()).toEqual(
      rows.map((row) => row.id).sort()
    )
    expect(await statsJobs()).toEqual([])

    await runUploads(channel.id)

    expect(await imported()).toHaveLength(3)
    expect(await batchJobs()).toHaveLength(1)
  })

  it("books every Data API call and stops at uploads older than the last pass", async () => {
    const { channel } = await seed()

    await runUploads(channel.id)
    expect(await importUnits()).toBe(7)

    await runUploads(channel.id)
    expect(await importUnits()).toBe(9)
  })

  it("resumes from the unread page after the quota reset when the ledger is spent", async () => {
    env.cleanup()
    env = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_QUOTA: "3",
    })
    const { repo, channel } = await seed()

    const job = await runUploads(channel.id)

    expect(job.status).toBe("succeeded")
    expect((await imported()).map((row) => row.videoId).sort()).toEqual([
      "fake-past-1",
      "fake-past-2",
    ])
    const next = (await uploadJobs()).find((row) => row.id !== job.id)!
    expect(next.status).toBe("queued")
    expect(next.payload).toEqual({
      channelId: channel.id,
      pageToken: "2",
      passStartedAt: job.startedAt!.toISOString(),
    })
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
    expect((await repo.getChannelById(channel.id))!.uploadsSyncedAt).toBeNull()
  })

  it("resumes from the unread page when Google reports the quota exceeded", async () => {
    const { channel } = await seed()
    const page = fake.playlistPage.bind(fake)
    vi.spyOn(fake, "playlistPage").mockImplementation(
      async (token, playlistId, pageToken) => {
        if (pageToken) {
          throw new AppError("EXTERNAL", "YouTube API quota exceeded", {
            cause: "quota",
          })
        }
        return page(token, playlistId, pageToken)
      }
    )

    const job = await runUploads(channel.id)

    expect(job.status).toBe("succeeded")
    const next = (await uploadJobs()).find((row) => row.id !== job.id)!
    expect(next.payload).toEqual({
      channelId: channel.id,
      pageToken: "2",
      passStartedAt: job.startedAt!.toISOString(),
    })
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
  })

  it("continues from the page token in its payload", async () => {
    const { channel } = await seed()
    const pages = vi.spyOn(fake, "playlistPage")
    await jobQueue(env.db).enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId: channel.id, pageToken: "2" },
      maxAttempts: 1,
    })

    await runJobs(env.db, ["sync_uploads"])

    expect(pages.mock.calls[0]![2]).toBe("2")
    expect((await imported()).map((row) => row.videoId)).toEqual([
      "fake-past-3",
    ])
  })

  it("marks the channel synced at the pass start carried in the payload", async () => {
    const { repo, channel } = await seed()
    const passStartedAt = new Date(Date.now() - 2 * DAY_MS)
    await jobQueue(env.db).enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: {
        channelId: channel.id,
        pageToken: "2",
        passStartedAt: passStartedAt.toISOString(),
      },
      maxAttempts: 1,
    })

    await runJobs(env.db, ["sync_uploads"])

    expect((await repo.getChannelById(channel.id))!.uploadsSyncedAt).toEqual(
      passStartedAt
    )
  })

  it("falls back to duration when the content type probe is rejected", async () => {
    const { channel } = await seed()
    const probe = vi
      .spyOn(fake, "videoContentType")
      .mockRejectedValue(new AppError("VALIDATION", "Unknown dimension"))

    await runUploads(channel.id)

    expect((await imported()).map((row) => row.videoId).sort()).toEqual([
      "fake-past-1",
      "fake-past-2",
      "fake-past-3",
      "fake-past-4",
    ])
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it("fails with the reconnect message and calls Google never when the channel needs reconnecting", async () => {
    const { repo, channel } = await seed()
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    const playlist = vi.spyOn(fake, "uploadsPlaylist")

    const job = await runUploads(channel.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(RECONNECT_MESSAGE)
    expect(playlist).not.toHaveBeenCalled()
  })

  it("fails with the reconnect message when the channel lost its Google account", async () => {
    const { channel } = await seed()
    await env.db
      .update(youtubeChannels)
      .set({ accountId: null })
      .where(eq(youtubeChannels.id, channel.id))

    const job = await runUploads(channel.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(RECONNECT_MESSAGE)
  })

  it("reports progress after each page", async () => {
    const { channel } = await seed()
    const page = fake.playlistPage.bind(fake)
    vi.spyOn(fake, "playlistPage").mockImplementation(
      async (token, playlistId, pageToken) => {
        if (pageToken === "2") {
          await vi.waitFor(
            async () => {
              const [row] = await env.db
                .select({ progress: jobs.progress })
                .from(jobs)
                .where(
                  and(eq(jobs.type, "sync_uploads"), eq(jobs.status, "running"))
                )
              expect(row!.progress).toBeGreaterThan(0)
            },
            { timeout: 5_000 }
          )
        }
        return page(token, playlistId, pageToken)
      }
    )

    const job = await runUploads(channel.id)

    expect(job.status).toBe("succeeded")
  })
})
