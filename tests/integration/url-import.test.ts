import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { importFromUrl } from "@/features/downloads/service"
import { jobQueue } from "@/features/jobs/queue"
import { getProjectSnapshot } from "@/features/pipeline/snapshot"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { retryProject } from "@/features/projects/service"
import { projects as projectsTable } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({
    DOWNLOADER: "fake",
    FAKE_DOWNLOAD_FILE: fixtures.wide,
  })
})
afterEach(() => env.cleanup())

describe("importFromUrl", () => {
  it("downloads the video, names the project and continues the pipeline", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=abc123"
    )
    const projects = projectRepository(env.db)
    expect(await projects.getOrThrow(projectId)).toMatchObject({
      status: "downloading",
      name: "youtube.com abc123",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    })
    expect(
      (await jobQueue(env.db).listForProject(projectId)).map((j) => j.type)
    ).toEqual(["download"])

    const revisions = [(await getProjectSnapshot(env.db, projectId))!.revision]
    await runJobs(env.db, ["download"])
    revisions.push((await getProjectSnapshot(env.db, projectId))!.revision)
    await runJobs(env.db, ["probe"])
    revisions.push((await getProjectSnapshot(env.db, projectId))!.revision)
    expect(new Set(revisions).size).toBe(3)

    await runJobs(env.db, ["transcribe", "analyze", "select"])

    const project = await projects.getOrThrow(projectId)
    expect(project.name).toBe("Imported recording")
    expect(project.status).toBe("awaiting_layout")
    const source = await assetRepository(env.db).findByKind(projectId, "source")
    expect(source).toMatchObject({ mime: "video/mp4", width: 1920 })
    expect((await getStorage().stat(source!.storageKey))?.bytes).toBe(
      source!.bytes
    )
    expect(await getStorage().list("tmp/downloads")).toEqual([])
  })

  it("rejects links that aren't public web pages", async () => {
    await expect(importFromUrl(env.db, "http://localhost/x")).rejects.toThrow(
      "Paste a link to a video"
    )
    expect(await projectRepository(env.db).list()).toEqual([])
  })

  it("fails with a readable reason and can be retried", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://example.com/private"
    )
    await runJobs(env.db, ["download"])
    const projects = projectRepository(env.db)
    expect(await projects.getOrThrow(projectId)).toMatchObject({
      status: "failed",
      failedStep: "downloading",
      error: "This video is private",
    })
    expect(
      (await jobQueue(env.db).listForProject(projectId))[0]?.attempts
    ).toBe(1)

    await retryProject(env.db, projectId)
    expect((await projects.getOrThrow(projectId)).status).toBe("downloading")
    expect(
      (await jobQueue(env.db).listForProject(projectId))
        .filter((j) => j.status === "queued")
        .map((j) => j.type)
    ).toEqual(["download"])
  })

  it("refuses live streams", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://example.com/live/1"
    )
    await runJobs(env.db, ["download"])
    expect(
      (await projectRepository(env.db).getOrThrow(projectId)).error
    ).toMatch(/live stream/)
  })
})

describe("YouTube replay heatmap", () => {
  const setSource = (projectId: string, values: Record<string, unknown>) =>
    env.db
      .update(projectsTable)
      .set(values)
      .where(eq(projectsTable.id, projectId))

  it("keeps the heatmap from the download", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=heatmap1"
    )
    await runJobs(env.db, ["download"])
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.audienceHeatmap).toHaveLength(20)
    expect(project.audienceHeatmap![12]).toMatchObject({ value: 1 })
  })

  it("fetches it when finding highlights for an older import", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=heatmap2"
    )
    await runJobs(env.db, ["download", "probe", "transcribe", "analyze"])
    await setSource(projectId, { audienceHeatmap: null })
    await runJobs(env.db, ["select"])
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.audienceHeatmap).toHaveLength(20)
    expect(project.status).toBe("awaiting_layout")
  })

  it("still finds highlights when the site won't answer", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=abc123"
    )
    await runJobs(env.db, ["download", "probe", "transcribe", "analyze"])
    await setSource(projectId, {
      audienceHeatmap: null,
      sourceUrl: "https://www.youtube.com/watch?v=private1",
    })
    await runJobs(env.db, ["select"])
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.audienceHeatmap).toBeNull()
    expect(project.status).toBe("awaiting_layout")
  })
})
