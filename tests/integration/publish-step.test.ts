import { eq } from "drizzle-orm"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { jobQueue } from "@/features/jobs/queue"
import type { LayoutInput } from "@/features/layout/schema"
import { confirmLayout } from "@/features/layout/service"
import { onJobCancelled } from "@/features/pipeline/handlers"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { nextQuotaReset, pacificDay } from "@/features/publishing/quota"
import { publishingRepository } from "@/features/publishing/repository"
import type { PublishInput } from "@/features/publishing/schema"
import { getYouTubeClient } from "@/features/publishing/youtube"
import { startClipRenders } from "@/features/render/service"
import {
  account,
  clips,
  jobs,
  projects,
  user,
  workspaces,
} from "@/lib/db/schema"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { server } from "../utils/msw"
import { runJobs, uploadFixture } from "../utils/pipeline"
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

const BYTES = 4096

const metadata: PublishInput = {
  title: "Clutch",
  description: "Last one standing",
  tags: ["fps"],
  privacy: "private",
  publishAt: null,
}

async function seedChannel() {
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
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId,
    accountId,
    channelId: "UC1",
    title: "Channel",
  })
  return { workspaceId, channel }
}

async function seed(meta: PublishInput = metadata) {
  const { workspaceId, channel } = await seedChannel()
  const project = await projectRepository(env.db).create({
    workspaceId,
    name: "Stream",
    settings: { ...defaultProjectSettings, language: "pt" },
  })
  const clipRepo = clipRepository(env.db)
  const [clip] = await clipRepo.replaceCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
  ])
  const storageKey = storageKeys.render(project.id, clip!.id, 1)
  await getStorage().writeBuffer(storageKey, Buffer.alloc(BYTES))
  const asset = await assetRepository(env.db).create({
    projectId: project.id,
    kind: "render",
    storageKey,
    mime: "video/mp4",
    bytes: BYTES,
  })
  await clipRepo.update(clip!.id, {
    status: "rendered",
    renderAssetId: asset.id,
  })
  const repo = publishingRepository(env.db)
  const publication = await repo.createPublication({
    clipId: clip!.id,
    channelId: channel.id,
    renderAssetId: asset.id,
    metadata: meta,
    status: "queued",
  })
  const job = await enqueuePublish(project.id, publication.id)
  return { repo, channel, project, clip: clip!, asset, publication, job }
}

function enqueuePublish(projectId: string, publicationId: string) {
  return jobQueue(env.db).enqueue({
    type: "publish_clip",
    projectId,
    payload: { publicationId },
  })
}

const publishJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "publish_clip"))

async function runPublish() {
  await runJobs(env.db, ["publish_clip"])
}

async function retryNow(jobId: string) {
  await env.db
    .update(jobs)
    .set({ runAfter: new Date() })
    .where(eq(jobs.id, jobId))
  await runPublish()
}

function tokenEndpoint() {
  const calls: URLSearchParams[] = []
  server.use(
    http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
      calls.push(new URLSearchParams(await request.text()))
      return HttpResponse.json({
        access_token: "fresh-token",
        expires_in: 3600,
      })
    })
  )
  return calls
}

const tokenRejected = () =>
  new AppError("UNAUTHORIZED", "YouTube rejected the access token", {
    cause: "token",
  })

describe("publish_clip", () => {
  it("uploads the render and ends published with the video id", async () => {
    const { repo, project, publication, job, asset } = await seed()
    const youtube = getYouTubeClient()
    const start = vi.spyOn(youtube, "startUpload")

    await runPublish()

    const saved = (await repo.getPublication(publication.id))!
    expect(saved.status).toBe("published")
    expect(saved.videoId).toMatch(/^fake-\d+$/)
    expect(saved.url).toBe(`https://youtube.com/shorts/${saved.videoId}`)
    expect(saved.publishedAt).toBeInstanceOf(Date)
    expect(saved.uploadUri).toBeTruthy()
    expect(start).toHaveBeenCalledOnce()
    const [, body, bytes] = start.mock.calls[0]!
    expect(bytes).toBe(BYTES)
    expect(body).toMatchObject({
      snippet: { title: "Clutch", defaultLanguage: "pt" },
      status: { privacyStatus: "private" },
    })
    expect((await jobQueue(env.db).get(job.id))!.status).toBe("succeeded")
    expect((await jobQueue(env.db).get(job.id))!.progress).toBe(100)
    expect(await assetRepository(env.db).get(asset.id)).toBeDefined()
    expect(
      (await projectRepository(env.db).getOrThrow(project.id)).status
    ).toBe("uploaded")
  })

  it("sends a scheduled publishAt read back from the stored metadata", async () => {
    const publishAt = new Date("2026-12-01T18:00:00.000Z")
    await seed({ ...metadata, privacy: "public", publishAt })
    const start = vi.spyOn(getYouTubeClient(), "startUpload")

    await runPublish()

    expect(start.mock.calls[0]![1]).toMatchObject({
      status: { privacyStatus: "private", publishAt: publishAt.toISOString() },
    })
  })

  it("waits for the next Pacific midnight when the upload budget is spent", async () => {
    env.cleanup()
    env = await createTestEnv({
      YOUTUBE_CLIENT: "fake",
      YOUTUBE_DAILY_UPLOADS: "1",
    })
    const { repo, publication, job, project } = await seed()
    await repo.spendQuota({
      day: pacificDay(new Date()),
      workspaceId: project.workspaceId,
      kind: "upload",
      units: 1,
      budget: 1,
    })
    const start = vi.spyOn(getYouTubeClient(), "startUpload")

    await runPublish()

    expect((await repo.getPublication(publication.id))!.status).toBe(
      "waiting_quota"
    )
    expect(start).not.toHaveBeenCalled()
    const rows = await publishJobs()
    expect(rows.find((row) => row.id === job.id)!.status).toBe("succeeded")
    const next = rows.find((row) => row.id !== job.id)!
    expect(next.status).toBe("queued")
    expect(next.payload).toEqual({ publicationId: publication.id })
    expect(next.projectId).toBe(project.id)
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))
  })

  it("resumes the saved upload session after a failure", async () => {
    const { repo, publication, job } = await seed()
    const youtube = getYouTubeClient()
    const start = vi.spyOn(youtube, "startUpload")
    const offset = vi
      .spyOn(youtube, "uploadedBytes")
      .mockResolvedValueOnce(1024)
    const upload = vi
      .spyOn(youtube, "uploadFrom")
      .mockRejectedValueOnce(new AppError("EXTERNAL", "Connection reset"))

    await runPublish()
    const failed = (await repo.getPublication(publication.id))!
    expect(failed.status).toBe("uploading")
    expect(failed.uploadUri).toBeTruthy()
    expect((await jobQueue(env.db).get(job.id))!.status).toBe("queued")

    await retryNow(job.id)

    const saved = (await repo.getPublication(publication.id))!
    expect(saved.status).toBe("published")
    expect(saved.uploadUri).toBe(failed.uploadUri)
    expect(start).toHaveBeenCalledOnce()
    expect(offset).toHaveBeenCalledWith("stored-token", failed.uploadUri, BYTES)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0]![3]).toBe(0)
    expect(upload.mock.calls[1]![3]).toBe(1024)
  })

  it("re-queries instead of sending an empty range when YouTube has every byte", async () => {
    const { repo, publication, job } = await seed()
    await repo.updatePublication(publication.id, {
      uploadUri: await getYouTubeClient().startUpload("t", {}, BYTES),
    })
    vi.spyOn(getYouTubeClient(), "uploadedBytes").mockResolvedValueOnce(BYTES)
    const upload = vi.spyOn(getYouTubeClient(), "uploadFrom")

    await runPublish()

    expect(upload).not.toHaveBeenCalled()
    const queued = (await jobQueue(env.db).get(job.id))!
    expect(queued.status).toBe("queued")
    expect(queued.attempts).toBe(1)

    await retryNow(job.id)

    expect((await repo.getPublication(publication.id))!.status).toBe(
      "published"
    )
    expect(upload).toHaveBeenCalledOnce()
  })

  it("refreshes the token once on a 401 and resumes from the server offset", async () => {
    const calls = tokenEndpoint()
    const { repo, publication } = await seed()
    const youtube = getYouTubeClient()
    const offset = vi.spyOn(youtube, "uploadedBytes").mockResolvedValueOnce(512)
    const upload = vi
      .spyOn(youtube, "uploadFrom")
      .mockRejectedValueOnce(tokenRejected())

    await runPublish()

    expect((await repo.getPublication(publication.id))!.status).toBe(
      "published"
    )
    expect(calls).toHaveLength(1)
    expect(offset).toHaveBeenCalledWith(
      "fresh-token",
      expect.any(String),
      BYTES
    )
    expect(upload.mock.calls[1]![0]).toBe("fresh-token")
    expect(upload.mock.calls[1]![3]).toBe(512)
  })

  it("fails UNAUTHORIZED on a second 401", async () => {
    const calls = tokenEndpoint()
    const { repo, publication, job } = await seed()
    vi.spyOn(getYouTubeClient(), "uploadFrom").mockRejectedValue(
      tokenRejected()
    )

    await runPublish()

    expect(calls).toHaveLength(1)
    const failed = (await jobQueue(env.db).get(job.id))!
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBe(1)
    const saved = (await repo.getPublication(publication.id))!
    expect(saved.status).toBe("failed")
    expect(saved.error).toBe("YouTube rejected the access token")
  })

  it("waits for the reset when YouTube reports its quota exceeded mid-upload", async () => {
    const { repo, publication, job } = await seed()
    const youtube = getYouTubeClient()
    const start = vi.spyOn(youtube, "startUpload")
    vi.spyOn(youtube, "uploadFrom").mockRejectedValueOnce(
      new AppError("EXTERNAL", "YouTube API quota exceeded", { cause: "quota" })
    )

    await runPublish()

    const waiting = (await repo.getPublication(publication.id))!
    expect(waiting.status).toBe("waiting_quota")
    expect(waiting.uploadUri).toBeTruthy()
    const next = (await publishJobs()).find((row) => row.id !== job.id)!
    expect(next.runAfter).toEqual(nextQuotaReset(new Date()))

    await retryNow(next.id)

    expect((await repo.getPublication(publication.id))!.status).toBe(
      "published"
    )
    expect(start).toHaveBeenCalledOnce()
  })

  it("fails once with the reconnect message when the channel needs reconnecting", async () => {
    const { repo, channel, publication, job, project } = await seed()
    await repo.setChannelStatus(channel.id, "needs_reconnect")
    const start = vi.spyOn(getYouTubeClient(), "startUpload")

    await runPublish()

    const failed = (await jobQueue(env.db).get(job.id))!
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBe(1)
    const saved = (await repo.getPublication(publication.id))!
    expect(saved.status).toBe("failed")
    expect(saved.error).toMatch(/^Reconnect YouTube/)
    expect(start).not.toHaveBeenCalled()
    const after = await projectRepository(env.db).getOrThrow(project.id)
    expect(after.status).toBe("uploaded")
    expect(after.error).toBeNull()
  })

  it("cancels the job when the clip is deleted", async () => {
    const { clip, job } = await seed()
    await env.db.delete(clips).where(eq(clips.id, clip.id))

    await runPublish()

    expect((await jobQueue(env.db).get(job.id))!.status).toBe("cancelled")
  })

  it("marks the publication failed when its job is cancelled", async () => {
    const { repo, publication, job } = await seed()

    await onJobCancelled(env.db, job)

    const saved = (await repo.getPublication(publication.id))!
    expect(saved.status).toBe("failed")
    expect(saved.error).toBe("Cancelled")
  })
})

const camTop = {
  webcamRect: { x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "cam-top",
} satisfies LayoutInput

describe("publish_clip with a re-render", () => {
  it("keeps the published asset through a re-render and deletes it after upload", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const projectsRepo = projectRepository(env.db)
    await projectsRepo.updateSettings(projectId, {
      ...(await projectsRepo.getOrThrow(projectId)).settings,
      captionsEnabled: false,
    })
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    await confirmLayout(env.db, projectId, camTop)
    const clipRepo = clipRepository(env.db)
    const [first] = await clipRepo.listForProject(projectId)
    await setClipReviewStatus(env.db, projectId, first!.id, "approved")
    await startClipRenders(env.db, projectId, [first!.id])
    await runJobs(env.db, ["render_clip"])
    const oldAssetId = (await clipRepo.get(first!.id))!.renderAssetId!
    const assets = assetRepository(env.db)
    const oldAsset = (await assets.get(oldAssetId))!

    const { workspaceId, channel } = await seedChannel()
    await env.db
      .update(projects)
      .set({ workspaceId })
      .where(eq(projects.id, projectId))
    const repo = publishingRepository(env.db)
    const publication = await repo.createPublication({
      clipId: first!.id,
      channelId: channel.id,
      renderAssetId: oldAssetId,
      metadata,
      status: "queued",
    })
    await enqueuePublish(projectId, publication.id)

    await startClipRenders(env.db, projectId, [first!.id])
    await runJobs(env.db, ["render_clip"])
    const newAssetId = (await clipRepo.get(first!.id))!.renderAssetId!
    expect(newAssetId).not.toBe(oldAssetId)
    expect(await assets.get(oldAssetId)).toBeDefined()
    expect(await getStorage().stat(oldAsset.storageKey)).toBeTruthy()

    const upload = vi.spyOn(getYouTubeClient(), "uploadFrom")
    await runPublish()

    expect((await repo.getPublication(publication.id))!.status).toBe(
      "published"
    )
    expect(upload.mock.calls[0]![2]).toBe(
      getStorage().resolve(oldAsset.storageKey)
    )
    expect(await assets.get(oldAssetId)).toBeUndefined()
    expect(await getStorage().stat(oldAsset.storageKey)).toBeFalsy()
    expect(await assets.get(newAssetId)).toBeDefined()
    expect((await projectsRepo.getOrThrow(projectId)).status).toBe("done")
  })
})
