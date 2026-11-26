import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { updateClipAction } from "@/features/clips/actions"
import * as jobQueueModule from "@/features/jobs/queue"
import { clipRepository } from "@/features/clips/repository"
import { FILL_LAYOUT } from "@/features/layout/schema"
import { musicRepository } from "@/features/music/repository"
import { DEFAULT_AUDIO_MIX } from "@/features/music/schema"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import {
  publishClipAction,
  refreshStatsAction,
  retryPublicationAction,
} from "@/features/publishing/actions"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
import { getPublishing } from "@/features/publishing/queries"
import { publishingRepository } from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import {
  account,
  jobs,
  publications,
  user,
  workspaces,
  youtubeChannels,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"

import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const signedIn: { user: { id: string; name: string } | null } = { user: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/features/accounts/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        signedIn.user && { user: signedIn.user, session: {} },
    },
  }),
}))

const input = {
  title: "Great play",
  description: "desc",
  tags: ["a"],
  privacy: "private",
  publishAt: null,
}

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed(opts: { plan?: "free" | "admin" } = {}) {
  const id = crypto.randomUUID()
  const owner = { id, name: "Owner", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  await env.db
    .update(workspaces)
    .set({ plan: opts.plan ?? "free" })
    .where(eq(workspaces.id, workspace.id))
  const project = await projectRepository(env.db).create({
    name: "Stream",
    workspaceId: workspace.id,
    settings: defaultProjectSettings,
  })
  const render = await assetRepository(env.db).create({
    projectId: project.id,
    kind: "render",
    storageKey: `projects/${project.id}/clip.mp4`,
    mime: "video/mp4",
    durationMs: 20_000,
  })
  const [clip] = await clipRepository(env.db).addCandidates(project.id, [
    { startMs: 1_000, endMs: 20_000, title: "Clip" },
  ])
  await clipRepository(env.db).update(clip!.id, {
    status: "rendered",
    renderAssetId: render.id,
  })
  const accountRow = crypto.randomUUID()
  await env.db.insert(account).values({
    id: accountRow,
    accountId: "g1",
    providerId: "google",
    userId: owner.id,
  })
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId: workspace.id,
    accountId: accountRow,
    channelId: "UC1",
    title: "My Channel",
  })
  signedIn.user = owner
  return { owner, workspace, project, clip: clip!, render, channel }
}

const publishJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "publish_clip"))
const syncJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_stats"))

describe("publishClipAction", () => {
  it("creates a queued publication and enqueues one job", async () => {
    const { clip, render, project } = await seed()
    const result = await publishClipAction(clip.id, input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const publication = await publishingRepository(env.db).getPublication(
      result.value.publicationId
    )
    expect(publication).toMatchObject({
      status: "queued",
      renderAssetId: render.id,
      clipId: clip.id,
      clipStartMs: clip.startMs,
      clipEndMs: clip.endMs,
    })
    const rows = await publishJobs()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      projectId: project.id,
      payload: { publicationId: result.value.publicationId },
    })
  })

  it("rejects a clip that is not rendered", async () => {
    const { clip } = await seed()
    await clipRepository(env.db).update(clip.id, { status: "approved" })
    const result = await publishClipAction(clip.id, input)
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Render the latest edit first" },
    })
    expect(await publishJobs()).toHaveLength(0)
  })

  it("asks for a new render after only the music or the text changes", async () => {
    const { workspace, project, clip } = await seed()
    await assetRepository(env.db).create({
      projectId: project.id,
      kind: "source",
      storageKey: `projects/${project.id}/source.mp4`,
      mime: "video/mp4",
      durationMs: 60_000,
    })
    const track = await musicRepository(env.db).create({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      title: "Night drive",
      storageKey: `music/${workspace.id}/night.mp3`,
      mime: "audio/mpeg",
      durationMs: 60_000,
      peaks: [],
    })
    const unchanged = {
      startMs: clip.startMs,
      endMs: clip.endMs,
      title: clip.title,
      hook: clip.hook,
      captionOverrides: { pages: [] },
      layout: FILL_LAYOUT,
    }
    for (const change of [
      {
        audioMix: {
          ...DEFAULT_AUDIO_MIX,
          music: [{ trackId: track.id, startMs: 0, endMs: 5000 }],
        },
      },
      {
        textOverlays: [
          { text: "Wait for it", position: "top", startMs: 0, endMs: 3000 },
        ],
      },
    ]) {
      await clipRepository(env.db).update(clip.id, { status: "rendered" })
      const saved = await updateClipAction(project.id, clip.id, {
        ...unchanged,
        ...change,
      })
      expect(saved.ok).toBe(true)
      expect((await clipRepository(env.db).getOrThrow(clip.id)).status).toBe(
        "approved"
      )
      expect(await publishClipAction(clip.id, input)).toMatchObject({
        ok: false,
        error: { code: "CONFLICT", message: "Render the latest edit first" },
      })
    }
    expect(await publishJobs()).toHaveLength(0)
  })

  it("rejects when no channel is connected", async () => {
    const { clip, channel } = await seed()
    await env.db
      .delete(youtubeChannels)
      .where(eq(youtubeChannels.id, channel.id))
    const result = await publishClipAction(clip.id, input)
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Connect YouTube first" },
    })
  })

  it("rejects when the channel needs reconnecting", async () => {
    const { clip, channel } = await seed()
    await publishingRepository(env.db).setChannelStatus(
      channel.id,
      "needs_reconnect"
    )
    const result = await publishClipAction(clip.id, input)
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: RECONNECT_MESSAGE },
    })
    expect(await publishJobs()).toHaveLength(0)
  })

  it("creates one publication and job for concurrent submits", async () => {
    const { clip } = await seed({ plan: "admin" })
    const results = await Promise.all([
      publishClipAction(clip.id, input),
      publishClipAction(clip.id, input),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({
      error: { code: "CONFLICT", message: "This clip is already publishing" },
    })
    expect(await publishJobs()).toHaveLength(1)
    expect(await env.db.select().from(publications)).toHaveLength(1)
  })

  it("leaves no publication behind when enqueueing fails", async () => {
    const { clip } = await seed()
    const spy = vi
      .spyOn(jobQueueModule, "jobQueue")
      .mockImplementationOnce(() => {
        throw new Error("queue down")
      })
    const result = await publishClipAction(clip.id, input)
    spy.mockRestore()
    expect(result.ok).toBe(false)
    expect(await env.db.select().from(publications)).toHaveLength(0)
    expect((await publishClipAction(clip.id, input)).ok).toBe(true)
  })

  it("rejects a second publish while one is active", async () => {
    const { clip } = await seed({ plan: "admin" })
    expect((await publishClipAction(clip.id, input)).ok).toBe(true)
    const second = await publishClipAction(clip.id, input)
    expect(second).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "This clip is already publishing" },
    })
    expect(await publishJobs()).toHaveLength(1)
  })

  it("rejects once the plan's daily limit is reached", async () => {
    const { clip, project, render } = await seed()
    const second = (
      await clipRepository(env.db).addCandidates(project.id, [
        { startMs: 1_000, endMs: 20_000, title: "B" },
        { startMs: 1_000, endMs: 20_000, title: "C" },
      ])
    ).map((c) => c.id)
    for (const id of second) {
      await clipRepository(env.db).update(id, {
        status: "rendered",
        renderAssetId: render.id,
      })
    }
    expect((await publishClipAction(clip.id, input)).ok).toBe(true)
    expect((await publishClipAction(second[0]!, input)).ok).toBe(true)
    const third = await publishClipAction(second[1]!, input)
    expect(third).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Your plan allows 2 publishes a day",
      },
    })
  })

  it("returns NOT_FOUND for another workspace's clip", async () => {
    const { clip } = await seed()
    const id = crypto.randomUUID()
    const other = { id, name: "Other", email: `${id}@example.com` }
    await env.db.insert(user).values(other)
    await accountRepository(env.db).createPersonalWorkspace(other)
    signedIn.user = other
    const result = await publishClipAction(clip.id, input)
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
    expect(await publishJobs()).toHaveLength(0)
  })

  it("rejects invalid input", async () => {
    const { clip } = await seed()
    const result = await publishClipAction(clip.id, { ...input, title: "" })
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
  })
})

describe("retryPublicationAction", () => {
  it("creates a new publication with the same metadata from a failed one", async () => {
    const { clip } = await seed({ plan: "admin" })
    const first = await publishClipAction(clip.id, input)
    if (!first.ok) throw new Error("setup")
    const repo = publishingRepository(env.db)
    await repo.updatePublication(first.value.publicationId, {
      status: "failed",
      error: "boom",
    })
    const retry = await retryPublicationAction(first.value.publicationId)
    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.value.publicationId).not.toBe(first.value.publicationId)
    const created = await repo.getPublication(retry.value.publicationId)
    expect(created).toMatchObject({ status: "queued", clipId: clip.id })
    expect(created?.metadata).toMatchObject({ title: "Great play" })
    expect(await publishJobs()).toHaveLength(2)
  })

  it("returns NOT_FOUND for an imported Short", async () => {
    const { channel } = await seed({ plan: "admin" })
    const imported = await insertImportedPublication(env.db, channel.id, {
      status: "failed",
    })
    expect(await retryPublicationAction(imported.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", message: "Publication not found" },
    })
    expect(await publishJobs()).toHaveLength(0)
  })

  it("rejects retry unless the publication failed", async () => {
    const { clip } = await seed({ plan: "admin" })
    const first = await publishClipAction(clip.id, input)
    if (!first.ok) throw new Error("setup")
    const retry = await retryPublicationAction(first.value.publicationId)
    expect(retry).toMatchObject({ ok: false, error: { code: "CONFLICT" } })
  })

  it("refuses to retry once the scheduled time has passed", async () => {
    const { clip } = await seed({ plan: "admin" })
    const first = await publishClipAction(clip.id, {
      ...input,
      privacy: "public",
      publishAt: new Date(Date.now() + 3_600_000),
    })
    if (!first.ok) throw new Error("setup")
    const repo = publishingRepository(env.db)
    await repo.updatePublication(first.value.publicationId, {
      status: "failed",
      metadata: {
        ...input,
        privacy: "public",
        publishAt: new Date(Date.now() - 60_000),
      },
    })

    const retry = await retryPublicationAction(first.value.publicationId)

    expect(retry).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message:
          "The scheduled time has passed. Publish again with a new time.",
      },
    })
    expect(await publishJobs()).toHaveLength(1)
  })

  it("runs the checks again", async () => {
    const { clip, channel } = await seed({ plan: "admin" })
    const first = await publishClipAction(clip.id, input)
    if (!first.ok) throw new Error("setup")
    const repo = publishingRepository(env.db)
    await repo.updatePublication(first.value.publicationId, {
      status: "failed",
    })
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    const retry = await retryPublicationAction(first.value.publicationId)
    expect(retry).toMatchObject({ ok: false, error: { code: "CONFLICT" } })
  })

  it("returns NOT_FOUND for another workspace's publication", async () => {
    const { clip } = await seed({ plan: "admin" })
    const first = await publishClipAction(clip.id, input)
    if (!first.ok) throw new Error("setup")
    await publishingRepository(env.db).updatePublication(
      first.value.publicationId,
      { status: "failed" }
    )
    const id = crypto.randomUUID()
    const other = { id, name: "Other", email: `${id}@example.com` }
    await env.db.insert(user).values(other)
    await accountRepository(env.db).createPersonalWorkspace(other)
    signedIn.user = other
    const retry = await retryPublicationAction(first.value.publicationId)
    expect(retry).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
  })
})

describe("getPublishing", () => {
  it("reports channel, defaults, publications and remaining publishes", async () => {
    const { clip, project } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const [running] = await publishJobs()
    await env.db
      .update(jobs)
      .set({ status: "running", progress: 40 })
      .where(eq(jobs.id, running!.id))

    const state = await getPublishing(project.id)
    expect(state.channel).toEqual({ title: "My Channel", status: "ok" })
    expect(state.defaults.privacy).toBeDefined()
    expect(state.publishesLeftToday).toBe(1)
    expect(state.publications[clip.id]).toMatchObject({
      status: "queued",
      url: null,
      error: null,
      progress: 40,
    })
  })

  it("returns null channel and unlimited publishes on the admin plan", async () => {
    const { project, channel } = await seed({ plan: "admin" })
    await env.db
      .delete(youtubeChannels)
      .where(eq(youtubeChannels.id, channel.id))
    const state = await getPublishing(project.id)
    expect(state.channel).toBeNull()
    expect(state.publishesLeftToday).toBeNull()
  })

  it("adds the latest stats snapshot, retention values and early flag", async () => {
    const { clip, project } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const id = published.value.publicationId
    await publishingRepository(env.db).updatePublication(id, {
      status: "published",
      publishedAt: new Date(),
    })
    await statsRepository(env.db).add({
      publicationId: id,
      views: 10,
      likes: 2,
      comments: 1,
      averageViewDurationS: 8,
      averageViewPercentage: 40,
      retention: [
        { ratio: 0.5, watch: 0.9 },
        { ratio: 1, watch: 0.4 },
      ],
    })

    const state = await getPublishing(project.id)
    expect(state.publications[clip.id]).toMatchObject({
      early: true,
      refreshing: false,
      stats: { views: 10, retention: [0.9, 0.4], markers: [] },
    })
  })

  it("isn't refreshing while the only sync waits for the quota reset", async () => {
    const { clip, project } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const id = published.value.publicationId
    await jobQueueModule.jobQueue(env.db).enqueue({
      type: "sync_stats",
      projectId: null,
      payload: { publicationId: id },
      runAfter: new Date(Date.now() + 3_600_000),
    })

    const state = await getPublishing(project.id)
    expect(state.publications[clip.id]).toMatchObject({ refreshing: false })
    expect(await refreshStatsAction(id)).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Stats will refresh after YouTube's daily quota resets.",
      },
    })
    expect(await syncJobs()).toHaveLength(1)
  })
})

describe("refreshStatsAction", () => {
  it("enqueues a sync and refuses a second one while it is active", async () => {
    const { clip } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const id = published.value.publicationId
    expect((await refreshStatsAction(id)).ok).toBe(true)
    const again = await refreshStatsAction(id)
    expect(again).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Stats are already refreshing" },
    })
    expect(await syncJobs()).toHaveLength(1)
  })

  it("enqueues a sync for an imported Short of the workspace's channel", async () => {
    const { channel } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id)
    expect(await refreshStatsAction(imported.id)).toMatchObject({
      ok: true,
      value: { publicationId: imported.id },
    })
    const [job] = await syncJobs()
    expect(job?.payload).toEqual({ publicationId: imported.id })
  })

  it("refuses an imported Short of another workspace's channel", async () => {
    const { channel } = await seed()
    const imported = await insertImportedPublication(env.db, channel.id)
    const id = crypto.randomUUID()
    const other = { id, name: "Other", email: `${id}@example.com` }
    await env.db.insert(user).values(other)
    await accountRepository(env.db).createPersonalWorkspace(other)
    signedIn.user = other

    expect(await refreshStatsAction(imported.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: RECONNECT_MESSAGE },
    })
    expect(await syncJobs()).toHaveLength(0)
  })

  it("rejects with the reconnect message when the channel can't sync", async () => {
    const { clip, channel } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const id = published.value.publicationId
    const reconnect = {
      ok: false,
      error: { code: "CONFLICT", message: RECONNECT_MESSAGE },
    }

    await publishingRepository(env.db).setChannelStatus(
      channel.id,
      "needs_reconnect"
    )
    expect(await refreshStatsAction(id)).toMatchObject(reconnect)

    await publishingRepository(env.db).setChannelStatus(channel.id, "ok")
    await env.db
      .update(youtubeChannels)
      .set({ accountId: null })
      .where(eq(youtubeChannels.id, channel.id))
    expect(await refreshStatsAction(id)).toMatchObject(reconnect)

    expect(await syncJobs()).toHaveLength(0)
  })

  it("returns NOT_FOUND for another workspace's publication", async () => {
    const { clip } = await seed()
    const published = await publishClipAction(clip.id, input)
    if (!published.ok) throw new Error("setup")
    const id = crypto.randomUUID()
    const other = { id, name: "Other", email: `${id}@example.com` }
    await env.db.insert(user).values(other)
    await accountRepository(env.db).createPersonalWorkspace(other)
    signedIn.user = other

    expect(
      await refreshStatsAction(published.value.publicationId)
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
    expect(await syncJobs()).toHaveLength(0)
  })

  it("rejects an unknown publication", async () => {
    await seed()
    expect(await refreshStatsAction("missing")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    })
  })
})
