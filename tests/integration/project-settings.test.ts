import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { importFromUrl } from "@/features/downloads/service"
import { layoutRepository } from "@/features/layout/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import {
  findMoreHighlights,
  rerunProject,
  updateProjectSettings,
} from "@/features/projects/settings-service"
import { AppError } from "@/lib/errors"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function analyzedProject() {
  const { projectId } = await uploadFixture(fixtures.wide)
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  return projectRepository(env.db).getOrThrow(projectId)
}

describe("import options", () => {
  it("override the defaults for uploads", async () => {
    const { projectId } = await uploadFixture(fixtures.wide, "a.mp4", {
      "x-import-options": encodeURIComponent(
        JSON.stringify({ language: "pt", selectorMode: "manual" })
      ),
    })
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.settings).toMatchObject({
      language: "pt",
      selectorMode: "manual",
      audioTrack: null,
      renderQuality: "standard",
    })
  })

  it("override the defaults for link imports", async () => {
    const { projectId } = await importFromUrl(
      env.db,
      "https://www.youtube.com/watch?v=abc",
      { language: "es" }
    )
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.settings.language).toBe("es")
  })

  it("reject invalid options", async () => {
    await expect(
      uploadFixture(fixtures.wide, "a.mp4", {
        "x-import-options": encodeURIComponent('{"selectorMode":"magic"}'),
      })
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })
})

describe("project settings", () => {
  it("can't change while a step is running", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const projects = projectRepository(env.db)
    await projects.transition(projectId, "probing")
    const project = await projects.getOrThrow(projectId)
    await expect(
      updateProjectSettings(env.db, projectId, project.settings)
    ).rejects.toThrow(AppError)
  })

  it("suggests the earliest step to re-run", async () => {
    const project = await analyzedProject()
    const update = async (patch: object) =>
      updateProjectSettings(env.db, project.id, {
        ...(await projectRepository(env.db).getOrThrow(project.id)).settings,
        ...patch,
      })
    expect(await update({ targetClipCount: 2 })).toEqual({ rerun: "select" })
    expect(await update({ language: "pt" })).toEqual({ rerun: "transcribe" })
    expect(await update({ renderQuality: "high" })).toEqual({ rerun: null })
    expect(
      (await projectRepository(env.db).getOrThrow(project.id)).settings
        .renderQuality
    ).toBe("high")
  })

  it("turning autoEffects off clears only unedited tracks", async () => {
    const project = await analyzedProject()
    const clips = clipRepository(env.db)
    const [first] = await clips.listForProject(project.id)
    const [second] = await clips.addCandidates(project.id, [
      {
        startMs: first!.endMs,
        endMs: first!.endMs + 10_000,
        title: "Second",
        hook: "Hook",
        reason: "r",
        score: 0.5,
        beats: null,
      },
    ])
    await layoutRepository(env.db).savePreset(1920, 1080, {
      webcamRect: { x: 0.78, y: 0.03, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top",
    })
    const kept = { edited: true, events: [] }
    await clips.update(first!.id, { effects: kept })
    await clips.update(second!.id, {
      effects: { edited: false, events: [] },
    })
    const settings = (await projectRepository(env.db).getOrThrow(project.id))
      .settings
    await updateProjectSettings(env.db, project.id, {
      ...settings,
      autoEffects: false,
    })
    expect((await clips.getOrThrow(first!.id)).effects).toEqual(kept)
    expect((await clips.getOrThrow(second!.id)).effects).toBeNull()
    await updateProjectSettings(env.db, project.id, {
      ...settings,
      autoEffects: true,
    })
    expect((await clips.getOrThrow(first!.id)).effects).toEqual(kept)
    expect((await clips.getOrThrow(second!.id)).effects).toMatchObject({
      edited: false,
    })
  })

  it("offers the render re-run when autoEffects changes with rendered clips", async () => {
    const project = await analyzedProject()
    const clips = clipRepository(env.db)
    const [clip] = await clips.listForProject(project.id)
    await clips.update(clip!.id, { status: "rendered" })
    const settings = (await projectRepository(env.db).getOrThrow(project.id))
      .settings
    expect(
      await updateProjectSettings(env.db, project.id, {
        ...settings,
        autoEffects: !settings.autoEffects,
      })
    ).toEqual({ rerun: "render" })
  })

  it("re-transcribes and keeps approved clips", async () => {
    const project = await analyzedProject()
    const clips = clipRepository(env.db)
    const [kept] = await clips.listForProject(project.id)
    await setClipReviewStatus(env.db, project.id, kept!.id, "approved")
    await updateProjectSettings(env.db, project.id, {
      ...project.settings,
      language: "pt",
    })

    await rerunProject(env.db, project.id, "transcribe")
    const projects = projectRepository(env.db)
    expect((await projects.getOrThrow(project.id)).status).toBe("transcribing")
    expect(await jobQueue(env.db).countActive(project.id, ["transcribe"])).toBe(
      1
    )

    await runJobs(env.db, ["transcribe", "analyze", "select"])
    expect((await projects.getOrThrow(project.id)).status).toBe(
      "awaiting_layout"
    )
    expect(await clips.get(kept!.id)).toMatchObject({ status: "approved" })
  })

  it("re-runs highlight selection from a cancelled project", async () => {
    const project = await analyzedProject()
    const projects = projectRepository(env.db)
    await projects.transition(project.id, "selecting")
    await projects.transition(project.id, "cancelled")
    await rerunProject(env.db, project.id, "select")
    await runJobs(env.db, ["select"])
    expect((await projects.getOrThrow(project.id)).status).toBe(
      "awaiting_layout"
    )
  })

  it("refuses to re-render without rendered clips", async () => {
    const project = await analyzedProject()
    await expect(
      rerunProject(env.db, project.id, "render")
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("find more highlights", () => {
  it("adds candidates without touching or repeating existing clips", async () => {
    const project = await analyzedProject()
    const clips = clipRepository(env.db)
    const before = await clips.listForProject(project.id)
    expect(before.length).toBeGreaterThan(0)
    await setClipReviewStatus(env.db, project.id, before[0]!.id, "rejected")

    await findMoreHighlights(env.db, project.id)
    const projects = projectRepository(env.db)
    expect((await projects.getOrThrow(project.id)).status).toBe("selecting")
    await runJobs(env.db, ["select"])

    const after = await clips.listForProject(project.id)
    expect((await projects.getOrThrow(project.id)).status).toBe(
      "awaiting_layout"
    )
    for (const clip of before) {
      expect(after.find((c) => c.id === clip.id)).toBeDefined()
    }
    expect(await clips.get(before[0]!.id)).toMatchObject({ status: "rejected" })
    const added = after.filter((c) => !before.some((b) => b.id === c.id))
    for (const clip of added) {
      for (const old of before) {
        const overlap =
          Math.min(clip.endMs, old.endMs) - Math.max(clip.startMs, old.startMs)
        expect(
          overlap / Math.min(clip.endMs - clip.startMs, old.endMs - old.startMs)
        ).toBeLessThanOrEqual(0.2)
      }
    }
  })

  it("needs highlights to have been found first", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await expect(findMoreHighlights(env.db, projectId)).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })
})
