import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { autoEffectsFor } from "@/features/effects/service"
import { layoutRepository } from "@/features/layout/repository"
import { confirmLayout } from "@/features/layout/service"
import { projectRepository } from "@/features/projects/repository"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const camTop = {
  webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.4,
  mode: "cam-top" as const,
}

describe("confirmLayout", () => {
  it("confirms, moves to review and saves a preset for the next upload", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "awaiting_layout"
    )

    await confirmLayout(env.db, projectId, camTop, {
      confidence: 0.9,
      savePreset: true,
    })
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
    expect(await layoutRepository(env.db).get(projectId)).toMatchObject({
      ...camTop,
      sourceAspect: "16:9",
      confidence: 0.9,
      confirmedByUser: true,
    })
    expect(await layoutRepository(env.db).findPreset(1920, 1080)).toMatchObject(
      camTop
    )

    const second = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    expect(
      (await projectRepository(env.db).getOrThrow(second.projectId)).status
    ).toBe("ready_for_review")
    expect(
      (await layoutRepository(env.db).get(second.projectId))?.webcamRect
    ).toEqual(camTop.webcamRect)
  })

  it("saves edits later without changing the status", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    await confirmLayout(env.db, projectId, camTop)
    await confirmLayout(env.db, projectId, {
      ...camTop,
      webcamRect: null,
      mode: "no-cam-blur-fill",
    })
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
    expect((await layoutRepository(env.db).get(projectId))?.mode).toBe(
      "no-cam-blur-fill"
    )
  })

  it("rejects a webcam layout without a webcam and edits before probing", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await expect(confirmLayout(env.db, projectId, camTop)).rejects.toThrow(
      /probe/
    )
    await runJobs(env.db, ["probe"])
    await expect(
      confirmLayout(env.db, projectId, { ...camTop, webcamRect: null })
    ).rejects.toThrow(/Mark the webcam/)
  })

  it("re-plans auto tracks planned against the probe placeholder", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const clips = clipRepository(env.db)
    const [selected] = await clips.listForProject(projectId)
    const clip = await clips.update(selected!.id, {
      beats: [{ ms: selected!.startMs + 4000, kind: "reaction" }],
    })
    const placeholder = (await autoEffectsFor(env.db, projectId, [clip])).get(
      clip.id
    )!
    expect(placeholder.events.some((e) => e.kind === "focus")).toBe(false)
    await clips.update(clip.id, { effects: placeholder })

    await confirmLayout(env.db, projectId, camTop)
    const replanned = (await clips.getOrThrow(clip.id)).effects
    expect(replanned?.edited).toBe(false)
    expect(replanned?.events.some((e) => e.kind === "focus")).toBe(true)

    const edited = { edited: true, events: [] }
    await clips.update(clip.id, { effects: edited })
    await confirmLayout(env.db, projectId, { ...camTop, gameplayFocusX: 0.6 })
    expect((await clips.getOrThrow(clip.id)).effects).toEqual(edited)

    await clips.update(clip.id, {
      effects: null,
      layoutOverride: { ...camTop, webcamRect: null, mode: "no-cam-fill" },
    })
    await confirmLayout(env.db, projectId, camTop)
    expect((await clips.getOrThrow(clip.id)).effects).toBeNull()
  })

  it("leaves tracks alone when autoEffects is off", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const projects = projectRepository(env.db)
    await projects.updateSettings(projectId, {
      ...(await projects.getOrThrow(projectId)).settings,
      autoEffects: false,
    })
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    await confirmLayout(env.db, projectId, camTop)
    for (const clip of await clipRepository(env.db).listForProject(projectId)) {
      expect(clip.effects).toBeNull()
    }
  })
})
