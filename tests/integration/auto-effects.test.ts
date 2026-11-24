import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { frameAt, zoomRegion } from "@/features/effects/frame"
import { autoEffectsFor } from "@/features/effects/service"
import { layoutRepository } from "@/features/layout/repository"
import type { LayoutInput } from "@/features/layout/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
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
const source = { width: 1920, height: 1080 }
const noCam: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
}

async function project(layout: LayoutInput) {
  const { projectId } = await uploadFixture(fixtures.wide)
  await runJobs(env.db, ["probe"])
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
  it("maps a weird beat from the full frame into the zoomed crop", async () => {
    const projectId = await project(camTop)
    const result = await autoEffectsFor(env.db, projectId, [
      clip([{ ms: 25_000, kind: "weird", x: 0.5, y: 0.5 }]),
    ])
    const zoom = result.get("c1")!.events.find((e) => e.kind === "zoom")
    expect(zoom).toMatchObject({
      focus: { x: expect.closeTo(0.5, 2), y: expect.closeTo(0.5, 2) },
    })

    const target = { x: 0.35, y: 0.6 }
    const off = await autoEffectsFor(env.db, projectId, [
      clip([{ ms: 25_000, kind: "weird", ...target }]),
    ])
    const shifted = off.get("c1")!.events.find((e) => e.kind === "zoom")!
    const region = zoomRegion(camTop, source)
    expect(shifted).toMatchObject({
      focus: {
        x: expect.closeTo((target.x - region.x) / region.w, 5),
        y: expect.closeTo((target.y - region.y) / region.h, 5),
      },
    })
    const crop = frameAt(camTop, source, [shifted], shifted.startMs + 500)
      .regions[1]!.crop
    expect(crop.x).toBeLessThanOrEqual(target.x * source.width)
    expect(crop.x + crop.w).toBeGreaterThanOrEqual(target.x * source.width)
    expect(crop.y).toBeLessThanOrEqual(target.y * source.height)
    expect(crop.y + crop.h).toBeGreaterThanOrEqual(target.y * source.height)
  })

  it("maps a beat through the no-cam-fill crop, not the full frame", async () => {
    const projectId = await project(noCam)
    const result = await autoEffectsFor(env.db, projectId, [
      clip([{ ms: 25_000, kind: "weird", x: 0.6, y: 0.5 }]),
    ])
    const zoom = result.get("c1")!.events.find((e) => e.kind === "zoom")!
    if (zoom.kind !== "zoom") throw new Error("expected a zoom")
    const region = zoomRegion(noCam, source)
    expect(region.w).toBeLessThan(0.5)
    expect(zoom.focus.x).toBeCloseTo((0.6 - region.x) / region.w, 5)
    expect(zoom.focus.x).not.toBeCloseTo(0.6, 1)
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
