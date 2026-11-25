import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { addDays, relativePerformance } from "@/features/analytics/curves"
import {
  getAnalyticsChannel,
  getAnalyticsOverview,
  getShorts,
} from "@/features/analytics/queries"
import { analyticsRepository } from "@/features/analytics/repository"
import type { ChannelDay } from "@/features/analytics/schema"
import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { pacificDay } from "@/features/publishing/quota"
import { publishingRepository } from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import { account, jobs, user, youtubeChannels } from "@/lib/db/schema"

import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const signedIn: { user: { id: string; name: string } | null } = { user: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/features/accounts/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        signedIn.user && { user: signedIn.user, session: {} },
    },
  }),
}))

const DAY_MS = 86_400_000

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed({ syncedAt = new Date() as Date | null } = {}) {
  const id = crypto.randomUUID()
  const owner = { id, name: "Owner", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  const accountId = crypto.randomUUID()
  await env.db.insert(account).values({
    id: accountId,
    accountId: `g-${id}`,
    providerId: "google",
    userId: id,
  })
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId: workspace.id,
    accountId,
    channelId: "UC1",
    title: "My Channel",
  })
  await env.db
    .update(youtubeChannels)
    .set({ analyticsSyncedAt: syncedAt })
    .where(eq(youtubeChannels.id, channel.id))
  signedIn.user = owner
  return { workspace, channel }
}

const today = () => pacificDay(new Date())
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

async function nimbusShort(
  channelId: string,
  workspaceId: string,
  publishedAt: Date
) {
  const project = await projectRepository(env.db).create({
    workspaceId,
    name: "Stream",
    settings: defaultProjectSettings,
  })
  const [clip] = await clipRepository(env.db).replaceCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "Nimbus clip", score: 0.5 },
  ])
  const publication = await publishingRepository(env.db).createPublication({
    clipId: clip!.id,
    channelId,
    metadata: {
      title: "Nimbus Short",
      description: "",
      tags: [],
      privacy: "public",
      publishAt: null,
    },
    status: "published",
    videoId: `v-${clip!.id}`,
    url: `https://youtube.com/shorts/v-${clip!.id}`,
    publishedAt,
  })
  return { publication, clip: clip! }
}

async function withNumbers(
  publicationId: string,
  publishedAt: Date,
  daily: number[],
  views = daily.reduce((a, b) => a + b, 0)
) {
  await statsRepository(env.db).add({
    publicationId,
    views,
    likes: 1,
    comments: 0,
    averageViewDurationS: 10,
    averageViewPercentage: 60,
    retention: null,
  })
  const first = pacificDay(publishedAt)
  await analyticsRepository(env.db).upsertPublicationDaily(
    publicationId,
    daily.map((v, i) => ({
      day: addDays(first, i),
      views: v,
      estimatedMinutesWatched: 0,
      likes: 0,
      subscribersGained: 0,
    }))
  )
}

describe("getShorts", () => {
  it("lists imported and Nimbus Shorts newest first, without removed ones", async () => {
    const { workspace, channel } = await seed()
    const nimbusAt = daysAgo(10)
    const { publication: nimbus, clip } = await nimbusShort(
      channel.id,
      workspace.id,
      nimbusAt
    )
    await withNumbers(nimbus.id, nimbusAt, Array(9).fill(10))
    const importedAt = daysAgo(5)
    const imported = await insertImportedPublication(env.db, channel.id, {
      publishedAt: importedAt,
      metadata: {
        title: "Past short",
        description: "",
        tags: [],
        privacy: "public",
        publishAt: null,
      },
    })
    await withNumbers(imported.id, importedAt, [100, 50, 10, 10])
    const removed = await insertImportedPublication(env.db, channel.id, {
      publishedAt: daysAgo(3),
      status: "removed",
    })

    const shorts = await getShorts()

    expect(shorts.rows.map((r) => r.publicationId)).toEqual([
      imported.id,
      nimbus.id,
    ])
    expect(shorts.rows.map((r) => r.publicationId)).not.toContain(removed.id)
    expect(shorts.rows[0]).toMatchObject({
      origin: "imported",
      clipId: null,
      projectId: null,
      title: "Past short",
      url: imported.url,
      ageDays: 5,
      views: 170,
      averageViewPercentage: 60,
      viewsDay1: 150,
      viewsDay7: null,
      viewsDay28: null,
      relative: null,
    })
    expect(shorts.rows[1]).toMatchObject({
      origin: "nimbus",
      clipId: clip.id,
      projectId: clip.projectId,
      title: "Nimbus Short",
      viewsDay1: 20,
      viewsDay7: 80,
    })
    expect(shorts.dataThrough).toBe(addDays(pacificDay(nimbusAt), 8))
  })

  it("scores each Short against the others at the same age", async () => {
    const { channel } = await seed()
    const publishedAt = daysAgo(10)
    const ids: string[] = []
    for (const perDay of [10, 20, 30, 40, 50]) {
      const p = await insertImportedPublication(env.db, channel.id, {
        publishedAt,
      })
      await withNumbers(p.id, publishedAt, Array(9).fill(perDay))
      ids.push(p.id)
    }

    const { rows, median } = await getShorts()

    const target = rows.find((r) => r.publicationId === ids[4])!
    const curves = rows.map((r) => ({
      publicationId: r.publicationId,
      cumulative: r.curve,
    }))
    expect(target.relative).toBe(2)
    expect(target.relative).toBe(
      relativePerformance(
        { publicationId: target.publicationId, cumulative: target.curve },
        curves
      )
    )
    expect(median[8]).toBe(30 * 9)
  })

  it("measures age to the last day YouTube has data for", async () => {
    const { channel } = await seed()
    const through = addDays(today(), -3)
    const peersAt = daysAgo(20)
    for (let i = 0; i < 3; i++) {
      const p = await insertImportedPublication(env.db, channel.id, {
        publishedAt: peersAt,
      })
      const days = 1 + 20 - 3
      await withNumbers(p.id, peersAt, Array(days).fill(10))
    }
    const youngAt = daysAgo(4)
    const young = await insertImportedPublication(env.db, channel.id, {
      publishedAt: youngAt,
    })
    await withNumbers(young.id, youngAt, [100, 50])

    const { rows, dataThrough } = await getShorts()

    expect(dataThrough).toBe(through)
    const row = rows.find((r) => r.publicationId === young.id)!
    expect(row.curve).toEqual([100, 150])
    expect(row.relative).toBeNull()
  })

  it("ends each curve at the last day stored for that Short", async () => {
    const { channel } = await seed()
    const publishedAt = daysAgo(20)
    for (let i = 0; i < 3; i++) {
      const p = await insertImportedPublication(env.db, channel.id, {
        publishedAt,
      })
      await withNumbers(p.id, publishedAt, Array(18).fill(10))
    }
    const stale = await insertImportedPublication(env.db, channel.id, {
      publishedAt,
    })
    await withNumbers(stale.id, publishedAt, Array(7).fill(10))

    const { rows } = await getShorts()

    const row = rows.find((r) => r.publicationId === stale.id)!
    expect(row.curve).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(row.viewsDay7).toBeNull()
    expect(row.relative).toBe(1)
  })

  it("reports the import state from the latest sync_uploads job", async () => {
    const { channel } = await seed()
    const queue = jobQueue(env.db)
    expect((await getShorts()).importing).toEqual({
      state: "idle",
      error: null,
    })

    const failed = await queue.enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId: channel.id },
    })
    await env.db
      .update(jobs)
      .set({ status: "failed", error: "Quota gone" })
      .where(eq(jobs.id, failed.id))
    expect((await getShorts()).importing).toEqual({
      state: "idle",
      error: "Quota gone",
    })

    const queued = await queue.enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId: channel.id },
    })
    expect((await getShorts()).importing).toEqual({
      state: "running",
      progress: 0,
    })
    await env.db
      .update(jobs)
      .set({ status: "succeeded" })
      .where(eq(jobs.id, queued.id))

    const resumesAt = new Date(Date.now() + 3_600_000)
    const deferred = await queue.enqueue({
      type: "sync_uploads",
      projectId: null,
      payload: { channelId: channel.id },
      runAfter: resumesAt,
    })
    expect((await getShorts()).importing).toEqual({
      state: "waiting_quota",
      resumesAt,
    })

    await env.db
      .update(jobs)
      .set({ status: "running", progress: 40, runAfter: new Date() })
      .where(eq(jobs.id, deferred.id))
    expect((await getShorts()).importing).toEqual({
      state: "running",
      progress: 40,
    })
  })

  it("is empty without a channel", async () => {
    const id = crypto.randomUUID()
    const owner = { id, name: "Owner", email: `${id}@example.com` }
    await env.db.insert(user).values(owner)
    signedIn.user = owner

    expect(await getShorts()).toEqual({
      rows: [],
      median: [],
      dataThrough: null,
      importing: { state: "idle", error: null },
      uploadsSyncedAt: null,
    })
    expect(await getAnalyticsChannel()).toBeNull()
  })
})

function fakeDays(from: string, to: string): ChannelDay[] {
  const rows: ChannelDay[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    rows.push(
      {
        day,
        contentType: "shorts",
        views: 300,
        estimatedMinutesWatched: 60,
        averageViewDurationS: 12,
        likes: 20,
        comments: 3,
        shares: 2,
        subscribersGained: 5,
        subscribersLost: 1,
      },
      {
        day,
        contentType: "long",
        views: 100,
        estimatedMinutesWatched: 400,
        averageViewDurationS: 240,
        likes: 5,
        comments: 1,
        shares: 0,
        subscribersGained: 2,
        subscribersLost: 0,
      }
    )
  }
  return rows
}

describe("getAnalyticsOverview", () => {
  it("sums the period up to the last day with data", async () => {
    const { channel } = await seed()
    const through = addDays(today(), -2)
    await analyticsRepository(env.db).upsertChannelDaily(
      channel.id,
      fakeDays(addDays(through, -89), through)
    )
    const publishedAt = daysAgo(40)
    const gains = [
      ["Past short one", 5],
      ["Past short two", 1],
      ["Past short three", 9],
    ] as const
    const ids: string[] = []
    for (const [title, perDay] of gains) {
      const p = await insertImportedPublication(env.db, channel.id, {
        publishedAt,
        metadata: {
          title,
          description: "",
          tags: [],
          privacy: "public",
          publishAt: null,
        },
      })
      await withNumbers(p.id, publishedAt, Array(39).fill(perDay))
      ids.push(p.id)
    }

    const overview = await getAnalyticsOverview(28)

    expect(overview.dataThrough).toBe(through)
    expect(overview.split).toBe(true)
    expect(overview.summary?.current.views).toBe(11_200)
    expect(overview.series).toHaveLength(28)
    expect(overview.series.at(-1)).toEqual({
      day: through,
      shorts: 300,
      long: 100,
      other: 0,
    })
    expect(overview.topShorts.map((s) => s.title)).toEqual([
      "Past short three",
      "Past short one",
      "Past short two",
    ])
    expect(overview.topShorts[0]).toMatchObject({
      publicationId: ids[2],
      clipId: null,
      projectId: null,
      views: 9 * 28,
    })
    expect(overview.syncing).toBe(false)
    expect(await env.db.select().from(jobs)).toHaveLength(0)
  })

  it("has no summary before the first channel sync", async () => {
    await seed()
    expect(await getAnalyticsOverview(7)).toMatchObject({
      dataThrough: null,
      split: false,
      summary: null,
      series: [],
      topShorts: [],
    })
  })

  it("enqueues one channel sync when the numbers are stale", async () => {
    await seed({ syncedAt: new Date(Date.now() - 25 * 3_600_000) })

    await getAnalyticsOverview(28)
    const overview = await getAnalyticsOverview(28)

    const queued = await env.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, "sync_channel"))
    expect(queued).toHaveLength(1)
    expect(overview.syncing).toBe(true)
  })

  it("enqueues nothing for a channel that needs reconnecting", async () => {
    const { channel } = await seed({ syncedAt: null })
    await env.db
      .update(youtubeChannels)
      .set({ status: "needs_reconnect" })
      .where(eq(youtubeChannels.id, channel.id))

    const overview = await getAnalyticsOverview(28)

    expect(await env.db.select().from(jobs)).toHaveLength(0)
    expect(overview.syncing).toBe(false)
    expect(await getAnalyticsChannel()).toEqual({
      title: "My Channel",
      needsReconnect: true,
    })
  })
})
