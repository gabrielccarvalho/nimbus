import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { importFromUrl } from "@/features/downloads/service"
import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { retryProject } from "@/features/projects/service"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv({
    DOWNLOADER: "fake",
    FAKE_DOWNLOAD_FILE: fixtures.wide,
  })
})
afterEach(() => env.cleanup())

describe("importFromUrl", () => {
  it("downloads the video, names the project and continues the pipeline", async () => {
    const { projectId } = importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=abc123"
    )
    const projects = projectRepository(env.db)
    expect(projects.getOrThrow(projectId)).toMatchObject({
      status: "downloading",
      name: "youtube.com abc123",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    })
    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .map((j) => j.type)
    ).toEqual(["download"])

    await runJobs(env.db, [
      "download",
      "probe",
      "transcribe",
      "analyze",
      "select",
    ])

    const project = projects.getOrThrow(projectId)
    expect(project.name).toBe("Imported recording")
    expect(project.status).toBe("awaiting_layout")
    const source = assetRepository(env.db).findByKind(projectId, "source")
    expect(source).toMatchObject({ mime: "video/mp4", width: 1920 })
    expect((await getStorage().stat(source!.storageKey))?.bytes).toBe(
      source!.bytes
    )
    expect(await getStorage().list("tmp/downloads")).toEqual([])
  })

  it("rejects links that aren't public web pages", () => {
    expect(() => importFromUrl(env.db, "http://localhost/x")).toThrow(
      "Paste a link to a video"
    )
    expect(projectRepository(env.db).list()).toEqual([])
  })

  it("fails with a readable reason and can be retried", async () => {
    const { projectId } = importFromUrl(env.db, "https://example.com/private")
    await runJobs(env.db, ["download"])
    const projects = projectRepository(env.db)
    expect(projects.getOrThrow(projectId)).toMatchObject({
      status: "failed",
      failedStep: "downloading",
      error: "This video is private",
    })
    expect(jobQueue(env.db).listForProject(projectId)[0]?.attempts).toBe(1)

    retryProject(env.db, projectId)
    expect(projects.getOrThrow(projectId).status).toBe("downloading")
    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .filter((j) => j.status === "queued")
        .map((j) => j.type)
    ).toEqual(["download"])
  })

  it("refuses live streams", async () => {
    const { projectId } = importFromUrl(env.db, "https://example.com/live/1")
    await runJobs(env.db, ["download"])
    expect(projectRepository(env.db).getOrThrow(projectId).error).toMatch(
      /live stream/
    )
  })
})
