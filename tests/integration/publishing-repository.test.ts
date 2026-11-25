import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { pacificDay } from "@/features/publishing/quota"
import {
  publishingRepository,
  type NewPublication,
} from "@/features/publishing/repository"
import type { QuotaKind } from "@/features/publishing/schema"
import { analyticsRepository } from "@/features/analytics/repository"
import {
  account,
  channelDaily,
  channelTopVideos,
  clips,
  user,
  workspaces,
} from "@/lib/db/schema"

import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const metadata = {
  title: "Clutch",
  description: "",
  tags: [],
  privacy: "private" as const,
  publishAt: null,
}

async function seed() {
  const userId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: "g-1",
    providerId: "google",
    userId,
  })
  const [acc] = await env.db.select().from(account)
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const repo = publishingRepository(env.db)
  const channel = await repo.upsertChannel({
    workspaceId,
    accountId: acc!.id,
    channelId: "UC1",
    title: "Channel",
  })
  const project = await projectRepository(env.db).create({
    name: "Stream",
    settings: defaultProjectSettings,
  })
  const [clip] = await clipRepository(env.db).replaceCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
  ])
  const asset = await assetRepository(env.db).create({
    projectId: project.id,
    kind: "render",
    storageKey: "r.mp4",
    mime: "video/mp4",
  })
  const publish = (patch: Partial<NewPublication> = {}) =>
    repo.createPublication({
      clipId: clip!.id,
      channelId: channel.id,
      renderAssetId: asset.id,
      metadata,
      status: "queued",
      ...patch,
    })
  return { repo, channel, project, clip: clip!, asset, publish, workspaceId }
}

describe("publishingRepository", () => {
  it("keeps uploads in their own quota bucket and shares list, stats and import", async () => {
    const { repo } = await seed()
    const spend = (kind: QuotaKind, budget: number) =>
      repo.spendQuota({
        day: "2026-11-24",
        workspaceId: null,
        kind,
        units: 1,
        budget,
      })
    expect(await spend("upload", 3)).toBe(true)
    expect(await spend("upload", 3)).toBe(true)
    expect(await spend("upload", 3)).toBe(true)
    expect(await spend("upload", 3)).toBe(false)
    expect(await spend("stats", 10_000)).toBe(true)
    expect(await spend("list", 2)).toBe(true)
    expect(await spend("stats", 2)).toBe(false)
    expect(await spend("import", 2)).toBe(false)
    expect(await spend("import", 3)).toBe(true)
  })

  it("ignores finished publications when looking for an active one", async () => {
    const { repo, clip, publish } = await seed()
    await publish({ status: "published" })
    await publish({ status: "failed" })
    expect(await repo.activeForClip(clip.id)).toBeUndefined()
    const waiting = await publish({ status: "waiting_quota" })
    expect((await repo.activeForClip(clip.id))?.id).toBe(waiting.id)
  })

  it("reports a render as in use only while its publication is active", async () => {
    const { repo, asset, publish } = await seed()
    const queued = await publish()
    expect(await repo.assetInActiveUse(asset.id)).toBe(true)
    await repo.updatePublication(queued.id, { status: "published" })
    expect(await repo.assetInActiveUse(asset.id)).toBe(false)
  })

  it("returns the newest publication per clip", async () => {
    const { repo, clip, publish } = await seed()
    await publish({ status: "failed" })
    await new Promise((r) => setTimeout(r, 5))
    const newest = await publish({ status: "published" })
    const latest = await repo.latestForClips([clip.id])
    expect(latest.get(clip.id)?.id).toBe(newest.id)
    expect((await repo.latestForClips([])).size).toBe(0)
  })

  it("counts publications by Pacific day", async () => {
    const { repo, workspaceId, publish } = await seed()
    await publish({ createdAt: new Date("2026-11-24T07:30:00Z") })
    await publish({ createdAt: new Date("2026-11-24T08:30:00Z") })
    expect(await repo.countCreatedOnDay(workspaceId, "2026-11-23")).toBe(1)
    expect(await repo.countCreatedOnDay(workspaceId, "2026-11-24")).toBe(1)
  })

  it("leaves failed publications out of the daily count", async () => {
    const { repo, workspaceId, publish } = await seed()
    const day = pacificDay(new Date())
    await publish({ status: "failed" })
    await publish({ status: "published" })
    expect(await repo.countCreatedOnDay(workspaceId, day)).toBe(1)
  })

  it("leaves imported Shorts out of the daily and published counts", async () => {
    const { repo, channel, workspaceId, publish } = await seed()
    await publish({ status: "published" })
    await insertImportedPublication(env.db, channel.id)
    expect(
      await repo.countCreatedOnDay(workspaceId, pacificDay(new Date()))
    ).toBe(1)
    expect(await repo.countPublished(channel.id)).toBe(1)
  })

  it("doesn't let an imported Short with the same video block a clip", async () => {
    const { repo, channel, clip } = await seed()
    await insertImportedPublication(env.db, channel.id, { videoId: "v1" })
    expect(await repo.activeForClip(clip.id)).toBeUndefined()
    expect((await repo.latestForClips([clip.id])).size).toBe(0)
  })

  it("drops imported Shorts and channel days when the workspace switches YouTube channel", async () => {
    const { repo, channel, workspaceId, publish } = await seed()
    const nimbus = await publish({ status: "published", videoId: "n1" })
    const imported = await insertImportedPublication(env.db, channel.id)
    const analytics = analyticsRepository(env.db)
    await analytics.replaceChannelDays(channel.id, "2026-11-01", "2026-11-01", [
      {
        day: "2026-11-01",
        contentType: "shorts",
        views: 1,
        estimatedMinutesWatched: 1,
        averageViewDurationS: null,
        likes: 0,
        comments: 0,
        shares: 0,
        subscribersGained: 0,
        subscribersLost: 0,
      },
    ])
    await analytics.replaceTopVideos(channel.id, 28, "2026-11-01", [
      { videoId: "n1", views: 5 },
    ])
    const at = new Date("2026-11-20T00:00:00Z")
    await analytics.markSynced(channel.id, "uploadsSyncedAt", at)
    await analytics.markSynced(channel.id, "analyticsSyncedAt", at)
    const input = {
      workspaceId,
      accountId: channel.accountId,
      title: "Channel",
    }

    const same = await repo.upsertChannel({ ...input, channelId: "UC1" })
    expect(same.uploadsSyncedAt).toEqual(at)
    expect(await repo.getPublication(imported.id)).toBeDefined()
    expect(await env.db.select().from(channelDaily)).toHaveLength(1)

    const switched = await repo.upsertChannel({ ...input, channelId: "UC2" })
    expect(switched.id).toBe(channel.id)
    expect(switched.uploadsSyncedAt).toBeNull()
    expect(switched.analyticsSyncedAt).toBeNull()
    expect(await repo.getPublication(imported.id)).toBeUndefined()
    expect(await repo.getPublication(nimbus.id)).toBeDefined()
    expect(await env.db.select().from(channelDaily)).toEqual([])
    expect(await env.db.select().from(channelTopVideos)).toEqual([])
  })

  it("deletes publications with their clip", async () => {
    const { repo, clip, publish } = await seed()
    const row = await publish()
    await env.db.delete(clips).where(eq(clips.id, clip.id))
    expect(await repo.getPublication(row.id)).toBeUndefined()
  })
})
