import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import {
  applyManualSelection,
  setClipReviewStatus,
} from "@/features/clips/service"
import { layoutRepository } from "@/features/layout/repository"
import { projectRepository } from "@/features/projects/repository"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

async function analyzed(configure?: (projectId: string) => void) {
  const { projectId } = await uploadFixture(fixtures.wide)
  configure?.(projectId)
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  return projectId
}

describe("select step", () => {
  it("stores heuristic candidates and waits for layout confirmation", async () => {
    const projectId = await analyzed()
    const project = projectRepository(env.db).getOrThrow(projectId)
    expect(project.status).toBe("awaiting_layout")
    expect(project.awaitingManualSelection).toBe(false)
    const clips = clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      expect(clip.status).toBe("candidate")
      expect(clip.endMs - clip.startMs).toBeGreaterThanOrEqual(15_000)
      expect(clip.endMs).toBeLessThanOrEqual(20_100)
      expect(clip.reason).toMatch(/^Heuristic/)
    }
  })

  it("skips layout confirmation when a preset already confirmed it", async () => {
    layoutRepository(env.db).savePreset(1920, 1080, {
      webcamRect: { x: 0.78, y: 0.03, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top",
    })
    const projectId = await analyzed()
    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "ready_for_review"
    )
  })

  it("waits for pasted JSON in manual mode", async () => {
    const projectId = await analyzed((id) => {
      const projects = projectRepository(env.db)
      projects.updateSettings(id, {
        ...projects.getOrThrow(id).settings,
        selectorMode: "manual",
      })
    })
    expect(
      projectRepository(env.db).getOrThrow(projectId).awaitingManualSelection
    ).toBe(true)
    expect(clipRepository(env.db).listForProject(projectId)).toEqual([])

    expect(() => applyManualSelection(env.db, projectId, "nope")).toThrow(
      /clips/
    )
    expect(() =>
      applyManualSelection(
        env.db,
        projectId,
        '{"clips":[{"startMs":50000,"endMs":70000}]}'
      )
    ).toThrow(/None of those clips fit/)

    const added = applyManualSelection(
      env.db,
      projectId,
      'Sure! {"clips":[{"startMs":6000,"endMs":19500,"title":"The boss","hook":"Wait…","reason":"Reaction","score":0.9}]}'
    )
    expect(added).toBe(1)
    expect(
      projectRepository(env.db).getOrThrow(projectId).awaitingManualSelection
    ).toBe(false)
    const [clip] = clipRepository(env.db).listForProject(projectId)
    expect(clip).toMatchObject({ title: "The boss", endMs: 20_000 })
    expect(clip!.endMs - clip!.startMs).toBeGreaterThanOrEqual(15_000)
  })
})

describe("clip review", () => {
  it("approves, rejects and resets only the project's own clips", async () => {
    const projectId = await analyzed()
    const [clip] = clipRepository(env.db).listForProject(projectId)
    expect(
      setClipReviewStatus(env.db, projectId, clip!.id, "approved").status
    ).toBe("approved")
    expect(
      setClipReviewStatus(env.db, projectId, clip!.id, "rejected").status
    ).toBe("rejected")
    expect(() =>
      setClipReviewStatus(env.db, "other", clip!.id, "approved")
    ).toThrow(/not found/)
    expect(() =>
      setClipReviewStatus(env.db, projectId, clip!.id, "rendered")
    ).toThrow(/only be/)
    clipRepository(env.db).setStatus([clip!.id], "rendering")
    expect(() =>
      setClipReviewStatus(env.db, projectId, clip!.id, "candidate")
    ).toThrow(/rendering/)
  })
})
