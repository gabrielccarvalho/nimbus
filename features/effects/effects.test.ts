import { describe, expect, it } from "vitest"

import { coverCrop, planLayout, toPixels } from "../layout/geometry"
import { FULL_FRAME, type LayoutInput } from "../layout/schema"
import { frameAt, SHAKE_SCALE, type FloatRect } from "./frame"
import { effectSchema, normalizeEffects, type Effect } from "./schema"

const zoom = (startMs: number, endMs: number): Effect => ({
  kind: "zoom",
  startMs,
  endMs,
  scale: 1.4,
  focus: { x: 0.5, y: 0.5 },
})
const shake = (startMs: number, endMs: number): Effect => ({
  kind: "shake",
  startMs,
  endMs,
  intensity: "light",
})
const focus = (startMs: number, endMs: number): Effect => ({
  kind: "focus",
  startMs,
  endMs,
})

const range = { startMs: 1000, endMs: 5000 }

describe("normalizeEffects", () => {
  it("clips events to the range", () => {
    expect(
      normalizeEffects([zoom(900, 2000), shake(6000, 6500)], range)
    ).toEqual([zoom(1000, 2000)])
  })

  it("drops events shorter than 100 ms after clipping", () => {
    expect(normalizeEffects([zoom(900, 1050)], range)).toEqual([])
  })

  it("resolves same-kind overlap by keeping the earlier event and trimming the later one", () => {
    expect(
      normalizeEffects([zoom(1000, 3000), zoom(2500, 4000)], range)
    ).toEqual([zoom(1000, 3000), zoom(3000, 4000)])
    expect(
      normalizeEffects([zoom(1000, 3000), zoom(2500, 3050)], range)
    ).toEqual([zoom(1000, 3000)])
  })

  it("keeps shakes overlapping focus/zoom", () => {
    const events = [focus(1000, 3000), shake(2000, 2500), zoom(2200, 4000)]
    expect(normalizeEffects(events, range)).toEqual([
      focus(1000, 3000),
      shake(2000, 2500),
      zoom(2200, 4000),
    ])
  })

  it("sorts by startMs", () => {
    expect(
      normalizeEffects([shake(3000, 3500), zoom(1000, 2000)], range)
    ).toEqual([zoom(1000, 2000), shake(3000, 3500)])
  })
})

describe("effectSchema", () => {
  it("rejects endMs <= startMs and scale 2.5", () => {
    expect(effectSchema.safeParse(shake(2000, 2000)).success).toBe(false)
    expect(
      effectSchema.safeParse({ ...zoom(0, 1000), scale: 2.5 }).success
    ).toBe(false)
    expect(effectSchema.safeParse(zoom(0, 1000)).success).toBe(true)
  })
})

describe("frameAt", () => {
  const source = { width: 1920, height: 1080 }
  const webcamRect = { x: 0.78, y: 0.77, w: 0.2, h: 0.2 }
  const camTop: LayoutInput = {
    webcamRect,
    gameplayRect: FULL_FRAME,
    gameplayFocusX: 0.5,
    mode: "cam-top",
  }
  const blur: LayoutInput = {
    ...camTop,
    webcamRect: null,
    mode: "no-cam-blur-fill",
  }
  const fill: LayoutInput = { ...camTop, webcamRect: null, mode: "no-cam-fill" }
  const zoomAt = (scale: number, focus = { x: 0.5, y: 0.5 }): Effect => ({
    kind: "zoom",
    startMs: 1000,
    endMs: 3000,
    scale,
    focus,
  })
  const inside = (inner: FloatRect, outer: FloatRect) => {
    expect(inner.x).toBeGreaterThanOrEqual(outer.x)
    expect(inner.y).toBeGreaterThanOrEqual(outer.y)
    expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w + 1e-9)
    expect(inner.y + inner.h).toBeLessThanOrEqual(outer.y + outer.h + 1e-9)
  }

  it("no events reproduces planLayout", () => {
    const plan = planLayout(camTop, 1920, 1080)
    if (!("regions" in plan)) throw new Error("expected a stacked plan")
    expect(frameAt(camTop, source, [], 0)).toEqual({
      regions: [
        { crop: plan.regions[0].crop, dest: { x: 0, y: 0, w: 1080, h: 672 } },
        {
          crop: plan.regions[1].crop,
          dest: { x: 0, y: 672, w: 1080, h: 1248 },
        },
      ],
    })

    const bottom = frameAt({ ...camTop, camPosition: "bottom" }, source, [], 0)
    expect(bottom.regions.map((region) => region.dest.h)).toEqual([1248, 672])

    const blurPlan = planLayout(blur, 1920, 1080)
    if (blurPlan.mode !== "no-cam-blur-fill") throw new Error("expected blur")
    expect(frameAt(blur, source, [], 0)).toEqual({
      regions: [
        {
          crop: blurPlan.background,
          dest: { x: 0, y: 0, w: 1080, h: 1920 },
          blur: true,
        },
        {
          crop: { x: 0, y: 0, w: 1920, h: 1080 },
          dest: { x: 0, y: 657, w: 1080, h: 606 },
        },
      ],
    })

    const fillPlan = planLayout(fill, 1920, 1080)
    if (fillPlan.mode !== "no-cam-fill") throw new Error("expected fill")
    expect(frameAt(fill, source, [], 0)).toEqual({
      regions: [
        { crop: fillPlan.crop, dest: { x: 0, y: 0, w: 1080, h: 1920 } },
      ],
    })
  })

  it("focus switches to a full-frame webcam region", () => {
    expect(frameAt(camTop, source, [focus(1000, 2000)], 1000)).toEqual({
      regions: [
        {
          crop: coverCrop(toPixels(webcamRect, 1920, 1080), 1080 / 1920),
          dest: { x: 0, y: 0, w: 1080, h: 1920 },
        },
      ],
    })
    expect(frameAt(camTop, source, [focus(1000, 2000)], 2000)).toEqual(
      frameAt(camTop, source, [], 2000)
    )
  })

  it("focus is ignored without a webcam", () => {
    expect(frameAt(blur, source, [focus(1000, 2000)], 1500)).toEqual(
      frameAt(blur, source, [], 1500)
    )
    expect(
      frameAt(
        { ...camTop, webcamRect: null },
        source,
        [focus(1000, 2000)],
        1500
      )
    ).toEqual(frameAt({ ...camTop, webcamRect: null }, source, [], 1500))
  })

  it("zoom midpoint crops to 1/scale around the focus point", () => {
    const base = frameAt(camTop, source, [], 2000).regions[1]!.crop
    const zoomed = frameAt(camTop, source, [zoomAt(1.4)], 2000).regions
    expect(zoomed[0]).toEqual(frameAt(camTop, source, [], 2000).regions[0])
    const crop = zoomed[1]!.crop
    expect(crop.w).toBeCloseTo(base.w / 1.4)
    expect(crop.h).toBeCloseTo(base.h / 1.4)
    expect(crop.x + crop.w / 2).toBeCloseTo(base.x + base.w / 2)
    expect(crop.y + crop.h / 2).toBeCloseTo(base.y + base.h / 2)

    const fgBase = frameAt(blur, source, [], 2000).regions[1]!.crop
    const fg = frameAt(blur, source, [zoomAt(1.4)], 2000).regions
    expect(fg[0]).toEqual(frameAt(blur, source, [], 2000).regions[0])
    expect(fg[1]!.crop.w).toBeCloseTo(fgBase.w / 1.4)

    const fillBase = frameAt(fill, source, [], 2000).regions[0]!.crop
    const filled = frameAt(fill, source, [zoomAt(1.4)], 2000).regions[0]!
    expect(filled.crop.w).toBeCloseTo(fillBase.w / 1.4)
  })

  it("zoom focus is relative to the gameplay crop", () => {
    const inset: LayoutInput = {
      ...camTop,
      gameplayRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    }
    expect(frameAt(inset, source, [], 2000).regions[1]!.crop).toEqual({
      x: 586,
      y: 108,
      w: 746,
      h: 864,
    })
    const crop = frameAt(inset, source, [zoomAt(2, { x: 0.3, y: 0.7 })], 2000)
      .regions[1]!.crop
    expect(crop.x + crop.w / 2).toBeCloseTo(586 + 0.3 * 746)
    expect(crop.y + crop.h / 2).toBeCloseTo(108 + 0.7 * 864)
  })

  it("zoom eases over 150 ms", () => {
    const base = frameAt(camTop, source, [], 0).regions[1]!.crop
    const widthAt = (tMs: number) =>
      frameAt(camTop, source, [zoomAt(1.4)], tMs).regions[1]!.crop.w
    expect(widthAt(1000)).toBeCloseTo(base.w)
    expect(base.w / widthAt(1075)).toBeCloseTo(1.2)
    expect(base.w / widthAt(1150)).toBeCloseTo(1.4)
    expect(base.w / widthAt(2925)).toBeCloseTo(1.2)
  })

  it("zoom clamps near frame edges", () => {
    const base = frameAt(camTop, source, [], 2000).regions[1]!.crop
    const crop = frameAt(camTop, source, [zoomAt(2, { x: 1, y: 1 })], 2000)
      .regions[1]!.crop
    inside(crop, base)
    expect(crop.x + crop.w).toBeCloseTo(base.x + base.w)
    expect(crop.y + crop.h).toBeCloseTo(base.y + base.h)
  })

  it("zoom inside focus has no effect", () => {
    expect(
      frameAt(camTop, source, [focus(0, 4000), zoomAt(1.4)], 2000)
    ).toEqual(frameAt(camTop, source, [focus(0, 4000)], 2000))
  })

  it("shake stays inside the original crop and is deterministic", () => {
    const events = [shake(1000, 2000), zoomAt(1.4)]
    const unshaken = frameAt(camTop, source, [zoomAt(1.4)], 1500).regions
    const shaken = frameAt(camTop, source, events, 1500).regions
    expect(frameAt(camTop, source, events, 1500)).toEqual({ regions: shaken })
    shaken.forEach((region, i) => {
      inside(region.crop, unshaken[i]!.crop)
      expect(region.crop.w).toBeCloseTo(unshaken[i]!.crop.w / SHAKE_SCALE.light)
    })

    const strong: Effect = {
      kind: "shake",
      startMs: 1000,
      endMs: 2000,
      intensity: "strong",
    }
    const offset = (tMs: number) => {
      const base = frameAt(fill, source, [], tMs).regions[0]!.crop
      const crop = frameAt(fill, source, [strong], tMs).regions[0]!.crop
      return Math.hypot(
        crop.x + crop.w / 2 - (base.x + base.w / 2),
        crop.y + crop.h / 2 - (base.y + base.h / 2)
      )
    }
    const peak = (fromMs: number) =>
      Math.max(...Array.from({ length: 84 }, (_, i) => offset(fromMs + i)))
    expect(peak(1080)).toBeGreaterThan(peak(1880))
    expect(peak(1880)).toBeGreaterThan(0)
  })

  it("strong shake fits inside its over-scale without clamping", () => {
    const strong: Effect = {
      kind: "shake",
      startMs: 1000,
      endMs: 2000,
      intensity: "strong",
    }
    const base = frameAt(fill, source, [], 1100).regions[0]!.crop
    const crop = frameAt(fill, source, [strong], 1100).regions[0]!.crop
    expect(crop.w).toBeCloseTo(base.w / SHAKE_SCALE.strong)
    expect(crop.x + crop.w / 2).not.toBeCloseTo(base.x + base.w / 2)
    expect(crop.y + crop.h / 2).not.toBeCloseTo(base.y + base.h / 2)
    expect(crop.x).toBeGreaterThan(base.x)
    expect(crop.y).toBeGreaterThan(base.y)
    expect(crop.x + crop.w).toBeLessThan(base.x + base.w)
    expect(crop.y + crop.h).toBeLessThan(base.y + base.h)
  })
})
