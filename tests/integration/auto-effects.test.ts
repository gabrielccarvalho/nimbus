import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { autoEffectsFor } from "@/features/effects/service"
import { layoutRepository } from "@/features/layout/repository"
import type { LayoutInput } from "@/features/layout/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const camTop: LayoutInput = {
  webcamRect: { x: 0.78, y: 0.03, w: 0.2, h: 0.2 },
  gameplayRect: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 },
  gameplayFocusX: 0.5,
  mode: "cam-top",
}
const noCam: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
}

async function project(layout: LayoutInput) {
  const { projectId } = await uploadFixture(fixtures.wide)
  await layoutRepository(env.db).upsert(projectId, {
    ...layout,
    sourceAspect: "16:9",
  })
  return projectId
}

const clip = (
  beats: NonNullable<Parameters<typeof autoEffectsFor>[2][number]["beats"]>,
  layoutOverride: LayoutInput | null = null
) => ({
  id: "c1",
  startMs: 10_000,
  endMs: 40_000,
  beats,
  layoutOverride,
})

describe("autoEffectsFor", () => {
  it("maps a weird beat from the full frame into the gameplay region", async () => {
    const projectId = await project(camTop)
    const result = await autoEffectsFor(env.db, projectId, [
      clip([{ ms: 25_000, kind: "weird", x: 0.5, y: 0.5 }]),
    ])
    const zoom = result.get("c1")!.events.find((e) => e.kind === "zoom")
    expect(zoom).toMatchObject({ focus: { x: 0.5, y: 0.5 } })

    const off = await autoEffectsFor(env.db, projectId, [
      clip([{ ms: 25_000, kind: "weird", x: 0.35, y: 0.9 }]),
    ])
    const shifted = off.get("c1")!.events.find((e) => e.kind === "zoom")
    expect(shifted).toMatchObject({
      focus: { x: expect.closeTo(0.25, 5), y: 1 },
    })
  })

  it("prefers the clip's layout override", async () => {
    const projectId = await project(noCam)
    const beats = [{ ms: 25_000, kind: "reaction" as const }]
    const base = await autoEffectsFor(env.db, projectId, [clip(beats)])
    expect(base.get("c1")!.events.some((e) => e.kind === "focus")).toBe(false)
    const overridden = await autoEffectsFor(env.db, projectId, [
      clip(beats, camTop),
    ])
    expect(overridden.get("c1")!.events.some((e) => e.kind === "focus")).toBe(
      true
    )
  })
})
