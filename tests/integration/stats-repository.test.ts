import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import { clipRepository } from "@/features/clips/repository"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import {
  publishingRepository,
  type NewPublication,
} from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import { account, user, workspaces } from "@/lib/db/schema"

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

const snapshot = (publicationId: string, fetchedAt: string, views = 1) => ({
  publicationId,
  fetchedAt: new Date(fetchedAt),
  views,
  likes: 0,
  comments: 0,
})

describe("statsRepository", () => {
  it("returns the newest snapshot per publication and the full history oldest first", async () => {
    const { publish } = await seed()
    const stats = statsRepository(env.db)
    const a = await publish({ status: "published" })
    const b = await publish({ status: "published" })
    await stats.add(snapshot(a.id, "2026-11-02T00:00:00Z", 5))
    await stats.add(snapshot(a.id, "2026-11-01T00:00:00Z", 1))
    await stats.add(snapshot(b.id, "2026-11-01T00:00:00Z", 9))

    const latest = await stats.latestFor([a.id, b.id])
    expect(latest.get(a.id)?.views).toBe(5)
    expect(latest.get(b.id)?.views).toBe(9)
    expect((await stats.history(a.id)).map((s) => s.views)).toEqual([1, 5])
    expect((await stats.latestFor([])).size).toBe(0)
  })

  it("lists only published publications with a video id as due candidates", async () => {
    const { publish } = await seed()
    const stats = statsRepository(env.db)
    const live = await publish({ status: "published", videoId: "v1" })
    await publish({ status: "published", videoId: null })
    await publish({ status: "removed", videoId: "v2" })
    await publish({ status: "failed", videoId: "v3" })
    await stats.add(snapshot(live.id, "2026-11-01T00:00:00Z"))
    await stats.add(snapshot(live.id, "2026-11-03T00:00:00Z"))

    const due = await stats.dueCandidates()
    expect(due).toHaveLength(1)
    expect(due[0]!.publication.id).toBe(live.id)
    expect(due[0]!.lastFetchedAt).toEqual(new Date("2026-11-03T00:00:00Z"))
  })

  it("has no last fetch for a publication without snapshots", async () => {
    const { publish } = await seed()
    await publish({ status: "published", videoId: "v1" })
    const due = await statsRepository(env.db).dueCandidates()
    expect(due[0]!.lastFetchedAt).toBeNull()
  })

  it("reports a sync as active only while a matching job is queued or running", async () => {
    const { publish } = await seed()
    const stats = statsRepository(env.db)
    const a = await publish({ status: "published", videoId: "v1" })
    const b = await publish({ status: "published", videoId: "v2" })
    expect(await stats.syncActive(a.id)).toBe(false)

    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "sync_stats",
      projectId: null,
      payload: { publicationId: a.id },
    })
    expect(await stats.syncActive(a.id)).toBe(true)
    expect(await stats.syncActive(b.id)).toBe(false)

    const leased = await queue.lease({ owner: "w", leaseMs: 60_000 })
    expect(leased?.id).toBe(job.id)
    expect(await stats.syncActive(a.id)).toBe(true)

    await queue.complete(job.id, "w")
    expect(await stats.syncActive(a.id)).toBe(false)
  })

  it("lists a channel's published publications newest first without removed ones", async () => {
    const { publish, channel, clip, project } = await seed()
    const stats = statsRepository(env.db)
    const older = await publish({
      status: "published",
      videoId: "v1",
      publishedAt: new Date("2026-11-01T00:00:00Z"),
    })
    const newer = await publish({
      status: "published",
      videoId: "v2",
      publishedAt: new Date("2026-11-05T00:00:00Z"),
    })
    await publish({ status: "removed", videoId: "v3" })
    await publish({ status: "queued" })
    await stats.add(snapshot(newer.id, "2026-11-06T00:00:00Z", 7))

    const rows = await stats.forChannel(channel.id)
    expect(rows.map((r) => r.publication.id)).toEqual([newer.id, older.id])
    expect(rows[0]).toMatchObject({ projectId: project.id })
    expect(rows[0]!.clip.id).toBe(clip.id)
    expect(rows[0]!.latest?.views).toBe(7)
    expect(rows[1]!.latest).toBeNull()
  })
})
