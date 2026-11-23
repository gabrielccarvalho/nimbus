import { afterEach, beforeEach, describe, expect, it } from "vitest"

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
})
