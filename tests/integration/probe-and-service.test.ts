import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { layoutRepository } from "@/features/layout/repository"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import {
  cancelProject,
  deleteProject,
  retryProject,
} from "@/features/projects/service"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

describe("probe step", () => {
  it.each([
    [fixtures.wide, 1920, 1080, "16:9", "cam-top"],
    [fixtures.ultrawide, 2560, 1080, "21:9", "cam-top"],
  ])("probes %s", async (file, width, height, aspect, mode) => {
    const { projectId } = await uploadFixture(file)
    await runJobs(env.db, ["probe"])

    const project = projectRepository(env.db).getOrThrow(projectId)
    expect(project.status).toBe("transcribing")
    const assets = assetRepository(env.db)
    expect(assets.findByKind(projectId, "source")).toMatchObject({
      width,
      height,
      fps: 30,
      codec: "h264",
    })
    expect(assets.findByKind(projectId, "source")?.durationMs).toBeGreaterThan(
      19_900
    )
    for (const kind of ["thumbnail", "proxy"] as const) {
      const asset = assets.findByKind(projectId, kind)
      expect(asset).toBeDefined()
      expect(
        (await getStorage().stat(asset!.storageKey))?.bytes
      ).toBeGreaterThan(0)
    }
    expect(layoutRepository(env.db).get(projectId)).toMatchObject({
      sourceAspect: aspect,
      mode,
      confirmedByUser: false,
    })
    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .map((j) => [j.type, j.status])
    ).toEqual([
      ["transcribe", "queued"],
      ["probe", "succeeded"],
    ])
  })

  it("applies a saved layout preset for the resolution", async () => {
    layoutRepository(env.db).savePreset(1920, 1080, {
      webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.4,
      mode: "cam-top",
    })
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe"])
    expect(layoutRepository(env.db).get(projectId)).toMatchObject({
      confirmedByUser: true,
      gameplayFocusX: 0.4,
    })
  })

  it("fails the project with a readable error for files without audio", async () => {
    const { projectId } = await uploadFixture(fixtures.noAudio)
    await runJobs(env.db, ["probe"])
    expect(projectRepository(env.db).getOrThrow(projectId)).toMatchObject({
      status: "failed",
      failedStep: "probing",
      error: "This file has no audio track",
    })
  })
})

describe("project service", () => {
  it("retries a failed step by re-enqueueing its job", async () => {
    const { projectId } = await uploadFixture(fixtures.noAudio)
    await runJobs(env.db, ["probe"])
    retryProject(env.db, projectId)
    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "probing"
    )
    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .filter((j) => j.status === "queued")
        .map((j) => j.type)
    ).toEqual(["probe"])
    expect(() => retryProject(env.db, projectId)).toThrow(/Only failed/)
  })

  it("cancels running work", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    projectRepository(env.db).transition(projectId, "probing")
    cancelProject(env.db, projectId)
    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "cancelled"
    )
    expect(jobQueue(env.db).countActive(projectId)).toBe(0)
    expect(() => cancelProject(env.db, projectId)).toThrow(/Nothing is running/)
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
      projects.transition(projectId, status)
    }
    const [clip] = clipRepository(env.db).replaceCandidates(projectId, [
      { startMs: 0, endMs: 15_000, title: "A" },
    ])
    clipRepository(env.db).setStatus([clip!.id], "rendering")
    cancelProject(env.db, projectId)
    expect(projects.getOrThrow(projectId).status).toBe("ready_for_review")
    expect(clipRepository(env.db).get(clip!.id)?.status).toBe("approved")
  })

  it("deletes the project, its jobs and its files", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await deleteProject(env.db, getStorage(), projectId)
    expect(projectRepository(env.db).get(projectId)).toBeUndefined()
    expect(await getStorage().list(`projects/${projectId}`)).toEqual([])
    await expect(
      deleteProject(env.db, getStorage(), projectId)
    ).rejects.toThrow(/not found/)
  })
})
