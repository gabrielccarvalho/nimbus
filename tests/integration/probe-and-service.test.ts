import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import {
  cancelProject,
  deleteProject,
  retryProject,
} from "@/features/projects/service"
import { getStorage, storageKeys } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("probe step", () => {
  it.each([
    [fixtures.wide, 1920, 1080],
    [fixtures.ultrawide, 2560, 1080],
    [fixtures.standard, 1440, 1080],
  ])("probes %s", async (file, width, height) => {
    const { projectId } = await uploadFixture(file)
    await runJobs(env.db, ["probe"])

    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.status).toBe("transcribing")
    const assets = assetRepository(env.db)
    expect(await assets.findByKind(projectId, "source")).toMatchObject({
      width,
      height,
      fps: 30,
      codec: "h264",
    })
    expect(
      (await assets.findByKind(projectId, "source"))?.durationMs
    ).toBeGreaterThan(19_900)
    for (const kind of ["thumbnail", "proxy"] as const) {
      const asset = await assets.findByKind(projectId, kind)
      expect(asset).toBeDefined()
      expect(
        (await getStorage().stat(asset!.storageKey))?.bytes
      ).toBeGreaterThan(0)
    }
    expect(
      (await jobQueue(env.db).listForProject(projectId)).map((j) => [
        j.type,
        j.status,
      ])
    ).toEqual([
      ["transcribe", "queued"],
      ["probe", "succeeded"],
    ])
  })

  it("keeps a thumbnail that already exists", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const key = storageKeys.thumbnail(projectId)
    await getStorage().writeBuffer(key, "from the site")
    await assetRepository(env.db).create({
      projectId,
      kind: "thumbnail",
      storageKey: key,
      mime: "image/jpeg",
      bytes: 13,
    })
    await runJobs(env.db, ["probe"])
    const thumbnails = (
      await assetRepository(env.db).listForProject(projectId)
    ).filter((asset) => asset.kind === "thumbnail")
    expect(thumbnails).toHaveLength(1)
    expect((await getStorage().stat(key))?.bytes).toBe(13)
  })

  it("fails the project with a readable error for files without audio", async () => {
    const { projectId } = await uploadFixture(fixtures.noAudio)
    await runJobs(env.db, ["probe"])
    expect(await projectRepository(env.db).getOrThrow(projectId)).toMatchObject(
      {
        status: "failed",
        failedStep: "probing",
        error: "This file has no audio track",
      }
    )
  })
})

describe("project service", () => {
  it("retries a failed step by re-enqueueing its job", async () => {
    const { projectId } = await uploadFixture(fixtures.noAudio)
    await runJobs(env.db, ["probe"])
    await retryProject(env.db, projectId)
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "probing"
    )
    expect(
      (await jobQueue(env.db).listForProject(projectId))
        .filter((j) => j.status === "queued")
        .map((j) => j.type)
    ).toEqual(["probe"])
    await expect(retryProject(env.db, projectId)).rejects.toThrow(/Only failed/)
  })

  it("cancels running work", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await projectRepository(env.db).transition(projectId, "probing")
    await cancelProject(env.db, projectId)
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "cancelled"
    )
    expect(await jobQueue(env.db).countActive(projectId)).toBe(0)
    await expect(cancelProject(env.db, projectId)).rejects.toThrow(
      /Nothing is running/
    )
  })

  it("cancelling a render returns the project to review", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const projects = projectRepository(env.db)
    for (const status of [
      "probing",
      "transcribing",
      "analyzing",
      "selecting",
      "ready_for_review",
      "rendering",
    ] as const) {
      await projects.transition(projectId, status)
    }
    const [clip] = await clipRepository(env.db).replaceCandidates(projectId, [
      { startMs: 0, endMs: 15_000, title: "A" },
    ])
    await clipRepository(env.db).setStatus([clip!.id], "rendering")
    await cancelProject(env.db, projectId)
    expect((await projects.getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
    expect((await clipRepository(env.db).get(clip!.id))?.status).toBe(
      "approved"
    )
  })

  it("deletes the project, its jobs and its files", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await deleteProject(env.db, getStorage(), projectId)
    expect(await projectRepository(env.db).get(projectId)).toBeUndefined()
    expect(await getStorage().list(`projects/${projectId}`)).toEqual([])
    await expect(
      deleteProject(env.db, getStorage(), projectId)
    ).rejects.toThrow(/not found/)
  })
})
