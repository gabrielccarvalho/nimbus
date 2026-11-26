import { describe, expect, it } from "vitest"

import { coverCrop, planLayout, toPixels } from "../layout/geometry"
import { FULL_FRAME, type LayoutInput } from "../layout/schema"
import {
  activeEffect,
  frameAt,
  SHAKE_SCALE,
  zoomFocusAt,
  zoomRegion,
  type FloatRect,
} from "./frame"
import type { SignalsData } from "../analysis/schema"
import { planEffects, PLANNER, type PlanInput } from "./planner"
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
const focus = (
  startMs: number,
  endMs: number,
  target: "cam" | "game" = "cam"
): Effect => ({
  kind: "focus",
  startMs,
  endMs,
  target,
})

const range = { startMs: 1000, endMs: 5000 }

const on = (lane: number, effect: Effect): Effect => ({ ...effect, lane })

describe("normalizeEffects", () => {
  it("clips events to the range", () => {
    expect(
      normalizeEffects([zoom(900, 2000), shake(6000, 6500)], range)
    ).toEqual([on(0, zoom(1000, 2000))])
  })

  it("drops events shorter than 100 ms after clipping", () => {
    expect(normalizeEffects([zoom(900, 1050)], range)).toEqual([])
  })

  it("trims a same-kind overlap between effects without a lane", () => {
    expect(
      normalizeEffects([zoom(1000, 3000), zoom(2500, 4000)], range)
    ).toEqual([on(0, zoom(1000, 3000)), on(0, zoom(3000, 4000))])
    expect(
      normalizeEffects([zoom(1000, 3000), zoom(2500, 3050)], range)
    ).toEqual([on(0, zoom(1000, 3000))])
  })

  it("packs overlapping effects without a lane into lanes", () => {
    const events = [focus(1000, 3000), shake(2000, 2500), zoom(2200, 4000)]
    expect(normalizeEffects(events, range)).toEqual([
      on(0, focus(1000, 3000)),
      on(1, shake(2000, 2500)),
      on(2, zoom(2200, 4000)),
    ])
  })

  it("keeps same-kind overlap across lanes and moves a clash in one lane down", () => {
    expect(
      normalizeEffects(
        [
          on(0, zoom(1000, 3000)),
          on(1, zoom(2000, 4000)),
          on(0, shake(2500, 2800)),
        ],
        range
      )
    ).toEqual([
      on(0, zoom(1000, 3000)),
      on(1, zoom(2000, 4000)),
      on(2, shake(2500, 2800)),
    ])
  })

  it("sorts by lane, then start", () => {
    expect(
      normalizeEffects([shake(3000, 3500), zoom(1000, 2000)], range)
    ).toEqual([on(0, zoom(1000, 2000)), on(0, shake(3000, 3500))])
  })
})

describe("activeEffect", () => {
  it("lets the upper lane win when effects of one kind overlap", () => {
    const strong = { ...on(0, zoom(1000, 3000)), scale: 2 }
    const events = [on(1, zoom(2000, 4000)), strong]
    expect(activeEffect(events, "zoom", 2500)).toBe(strong)
    expect(activeEffect(events, "zoom", 3500)).toBe(events[0])
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

  it("focus without target parses as cam", () => {
    expect(
      effectSchema.parse({ kind: "focus", startMs: 0, endMs: 1000 })
    ).toEqual(focus(0, 1000))
    expect(effectSchema.parse(focus(0, 1000, "game"))).toEqual(
      focus(0, 1000, "game")
    )
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

  it("full game shows one full-frame gameplay region", () => {
    const left: LayoutInput = {
      ...camTop,
      gameplayRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      gameplayFocusX: 0.2,
    }
    const game = [focus(1000, 2000, "game")]
    expect(frameAt(left, source, game, 1000)).toEqual({
      regions: [
        {
          crop: coverCrop(
            toPixels(left.gameplayRect, 1920, 1080),
            1080 / 1920,
            0.2
          ),
          dest: { x: 0, y: 0, w: 1080, h: 1920 },
        },
      ],
    })
    expect(frameAt(left, source, game, 2000)).toEqual(
      frameAt(left, source, [], 2000)
    )
    const split = { ...left, mode: "split-50" as const }
    expect(frameAt(split, source, game, 1500)).toEqual(
      frameAt(left, source, game, 1500)
    )
  })

  it("full game is ignored without a webcam", () => {
    const game = [focus(1000, 2000, "game")]
    for (const layout of [blur, fill, { ...camTop, webcamRect: null }]) {
      expect(frameAt(layout, source, game, 1500)).toEqual(
        frameAt(layout, source, [], 1500)
      )
    }
  })

  it("zoom inside full game zooms that region", () => {
    const game = focus(0, 4000, "game")
    const base = frameAt(camTop, source, [game], 2000).regions[0]!
    const zoomed = frameAt(
      camTop,
      source,
      [game, zoomAt(2, { x: 0.3, y: 0.6 })],
      2000
    ).regions
    expect(zoomed).toHaveLength(1)
    expect(zoomed[0]!.dest).toEqual(base.dest)
    const crop = zoomed[0]!.crop
    expect(crop.w).toBeCloseTo(base.crop.w / 2)
    expect(crop.x + crop.w / 2).toBeCloseTo(base.crop.x + 0.3 * base.crop.w)
    expect(crop.y + crop.h / 2).toBeCloseTo(base.crop.y + 0.6 * base.crop.h)

    const shaken = frameAt(camTop, source, [game, shake(1000, 3000)], 2000)
      .regions[0]!.crop
    inside(shaken, base.crop)
    expect(shaken.w).toBeCloseTo(base.crop.w / SHAKE_SCALE.light)
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

  it("zoomRegion is the zoomable crop as a share of the source", () => {
    const camTopCrop = frameAt(camTop, source, [], 0).regions[1]!.crop
    expect(zoomRegion(camTop, source)).toEqual({
      x: camTopCrop.x / 1920,
      y: camTopCrop.y / 1080,
      w: camTopCrop.w / 1920,
      h: camTopCrop.h / 1080,
    })
    const left = { ...fill, gameplayFocusX: 0.2 }
    const fillCrop = frameAt(left, source, [], 0).regions[0]!.crop
    const region = zoomRegion(left, source)
    expect(region).toEqual({
      x: fillCrop.x / 1920,
      y: 0,
      w: fillCrop.w / 1920,
      h: 1,
    })
    const target = { x: 0.3, y: 0.5 }
    const zoomed = frameAt(
      left,
      source,
      [
        zoomAt(2, {
          x: (target.x - region.x) / region.w,
          y: (target.y - region.y) / region.h,
        }),
      ],
      2000
    ).regions[0]!.crop
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(target.x * 1920, 5)
    expect(zoomed.y + zoomed.h / 2).toBeCloseTo(target.y * 1080, 5)
  })

  it("zoomFocusAt maps an output point into the gameplay region", () => {
    const gameplay = frameAt(camTop, source, [], 0).regions[1]!.dest
    expect(
      zoomFocusAt(camTop, source, [], 0, {
        x: gameplay.x + gameplay.w * 0.25,
        y: gameplay.y + gameplay.h * 0.75,
      })
    ).toEqual({ x: 0.25, y: 0.75 })
    expect(zoomFocusAt(camTop, source, [], 0, { x: -50, y: 0 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(zoomFocusAt(fill, source, [], 0, { x: 540, y: 1920 })).toEqual({
      x: 0.5,
      y: 1,
    })
    const foreground = frameAt(blur, source, [], 0).regions[1]!.dest
    expect(
      zoomFocusAt(blur, source, [], 0, {
        x: foreground.x + foreground.w / 2,
        y: foreground.y,
      })
    ).toEqual({ x: 0.5, y: 0 })
  })

  it("zoomFocusAt maps through the zoom on screen", () => {
    const gameplay = frameAt(camTop, source, [], 0).regions[1]!.dest
    const events = [zoomAt(2)]
    const corner = { x: gameplay.x, y: gameplay.y }
    const centre = {
      x: gameplay.x + gameplay.w / 2,
      y: gameplay.y + gameplay.h / 2,
    }
    expect(zoomFocusAt(camTop, source, events, 2000, corner)).toEqual({
      x: 0.25,
      y: 0.25,
    })
    expect(zoomFocusAt(camTop, source, events, 2000, centre)).toEqual({
      x: 0.5,
      y: 0.5,
    })
    expect(zoomFocusAt(camTop, source, events, 5000, corner)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it("zoomFocusAt ignores a full cam on screen", () => {
    const gameplay = frameAt(camTop, source, [], 0).regions[1]!.dest
    expect(
      zoomFocusAt(camTop, source, [focus(1000, 3000)], 2000, {
        x: gameplay.x,
        y: gameplay.y,
      })
    ).toEqual({ x: 0, y: 0 })
  })

  it("zoomFocusAt maps a click through full game on screen", () => {
    const game = focus(0, 4000, "game")
    expect(
      zoomFocusAt(camTop, source, [game], 2000, { x: 270, y: 1440 })
    ).toEqual({ x: 0.25, y: 0.75 })
    expect(
      zoomFocusAt(camTop, source, [game, zoomAt(2)], 2000, { x: 0, y: 0 })
    ).toEqual({ x: 0.25, y: 0.25 })

    const target = zoomFocusAt(camTop, source, [game], 2000, {
      x: 810,
      y: 480,
    })
    const crop = frameAt(camTop, source, [game, zoomAt(2, target)], 2000)
      .regions[0]!.crop
    const full = frameAt(camTop, source, [game], 2000).regions[0]!.crop
    expect(crop.x + crop.w / 2).toBeCloseTo(full.x + 0.75 * full.w)
    expect(crop.y + crop.h / 2).toBeCloseTo(full.y + 0.25 * full.h)
  })
})

function signalsWith(
  peaks: { ms: number; lufs: number }[],
  base = -30,
  durationMs = 60_000
): SignalsData {
  const loudness = Array.from({ length: durationMs / 250 }, () => base)
  for (const { ms, lufs } of peaks) loudness[Math.floor(ms / 250)] = lufs
  return {
    silences: [],
    loudness,
    loudnessIntervalMs: 250,
    speechDensity: [],
    cuts: [],
  }
}

function plan(overrides: Partial<PlanInput> = {}) {
  return planEffects({
    startMs: 0,
    endMs: 30_000,
    hasWebcam: true,
    signals: signalsWith([]),
    beats: [],
    ...overrides,
  }).map((effect): Effect => ({ ...effect, lane: undefined }))
}

describe("planEffects", () => {
  it("scream gives a strong shake and a focus with a webcam", () => {
    const events = plan({ signals: signalsWith([{ ms: 10_000, lufs: -10 }]) })
    expect(events).toEqual([
      { kind: "focus", startMs: 9700, endMs: 11_500, target: "cam" },
      { kind: "shake", startMs: 10_000, endMs: 10_500, intensity: "strong" },
    ])
  })

  it("scream gives only a shake without a webcam", () => {
    const events = plan({
      hasWebcam: false,
      signals: signalsWith([{ ms: 10_000, lufs: -17 }]),
    })
    expect(events).toEqual([
      { kind: "shake", startMs: 10_000, endMs: 10_500, intensity: "light" },
    ])
  })

  it("reaction beat snaps to the nearby loudness peak", () => {
    const events = plan({
      signals: signalsWith([{ ms: 11_500, lufs: -25 }]),
      beats: [{ ms: 10_000, kind: "reaction" }],
    })
    expect(events).toEqual([
      { kind: "focus", startMs: 11_200, endMs: 13_000, target: "cam" },
    ])
  })

  it("snaps to the densest speech window when loudness is flat", () => {
    const events = plan({
      signals: {
        ...signalsWith([]),
        speechDensity: [
          { startMs: 8000, endMs: 9000, wordsPerSecond: 1 },
          { startMs: 11_000, endMs: 12_000, wordsPerSecond: 4 },
        ],
      },
      beats: [{ ms: 10_000, kind: "reaction" }],
    })
    expect(events).toEqual([
      { kind: "focus", startMs: 11_200, endMs: 13_000, target: "cam" },
    ])
  })

  it("keeps the beat time when nothing can snap it", () => {
    const events = plan({ beats: [{ ms: 10_000, kind: "reaction" }] })
    expect(events).toEqual([
      { kind: "focus", startMs: 9700, endMs: 11_500, target: "cam" },
    ])
  })

  it("weird beat becomes a zoom at its focus point", () => {
    const events = plan({
      beats: [{ ms: 10_000, kind: "weird", x: 0.2, y: 0.7 }],
    })
    expect(events).toEqual([
      {
        kind: "zoom",
        startMs: 9250,
        endMs: 10_750,
        scale: 1.4,
        focus: { x: 0.2, y: 0.7 },
      },
    ])
  })

  it("loudness jump after quiet gives a centred zoom only when there are no beats", () => {
    const signals = signalsWith([{ ms: 10_000, lufs: -30 }], -45)
    expect(plan({ signals })).toEqual([
      {
        kind: "zoom",
        startMs: 9375,
        endMs: 10_875,
        scale: 1.4,
        focus: { x: 0.5, y: 0.5 },
      },
    ])
    const withBeat = plan({
      signals,
      beats: [{ ms: 20_000, kind: "weird", x: 0.5, y: 0.5 }],
    })
    expect(withBeat).toHaveLength(1)
    expect(withBeat[0]!.startMs).toBe(19_250)
  })

  it("respects caps", () => {
    const peaks = Array.from({ length: 10 }, (_, i) => ({
      ms: 2000 + i * 3000,
      lufs: -10,
    }))
    const events = plan({ signals: signalsWith(peaks) })
    const shakes = events.filter((e) => e.kind === "shake")
    const focuses = events.filter((e) => e.kind === "focus")
    expect(shakes.length).toBeLessThanOrEqual(PLANNER.maxShakes)
    const focusMs = focuses.reduce((sum, e) => sum + e.endMs - e.startMs, 0)
    expect(focusMs).toBeLessThanOrEqual(30_000 * PLANNER.maxFocusShare)
    for (const kind of ["shake", "focus"] as const) {
      const starts = events.filter((e) => e.kind === kind).map((e) => e.startMs)
      starts.forEach((start, i) => {
        if (i > 0) {
          expect(start - starts[i - 1]!).toBeGreaterThanOrEqual(
            PLANNER.minGapMs
          )
        }
      })
    }
  })

  it("leaves the first 500 ms alone unless a beat is there", () => {
    const signals = signalsWith([{ ms: 250, lufs: -10 }])
    expect(plan({ signals })).toEqual([])
    const withBeat = plan({
      signals,
      beats: [{ ms: 250, kind: "reaction" }],
    })
    expect(withBeat[0]).toMatchObject({ kind: "focus", startMs: 0 })
  })

  it("3 s clip that is loud throughout yields valid, non-overlapping events", () => {
    const events = plan({
      startMs: 4000,
      endMs: 7000,
      signals: signalsWith(
        [
          { ms: 4500, lufs: -1 },
          { ms: 5000, lufs: -1 },
          { ms: 6500, lufs: -1 },
        ],
        -10
      ),
    })
    for (const event of events) {
      expect(effectSchema.safeParse(event).success).toBe(true)
      expect(event.startMs).toBeGreaterThanOrEqual(4000)
      expect(event.endMs).toBeLessThanOrEqual(7000)
    }
    for (const kind of ["shake", "focus", "zoom"] as const) {
      const ofKind = events.filter((e) => e.kind === kind)
      ofKind.forEach((e, i) => {
        if (i > 0)
          expect(e.startMs).toBeGreaterThanOrEqual(ofKind[i - 1]!.endMs)
      })
    }
  })

  it("planner never creates a full game event", () => {
    const events = plan({
      signals: signalsWith([{ ms: 20_000, lufs: -10 }]),
      beats: [{ ms: 10_000, kind: "reaction" }],
    })
    const focuses = events.filter((e) => e.kind === "focus")
    expect(focuses).toHaveLength(2)
    for (const event of focuses) expect(event.target).toBe("cam")
  })

  it("flat audio and no beats yields no events", () => {
    expect(plan()).toEqual([])
  })

  it("never puts a zoom inside a focus or a second focus within the gap", () => {
    const withWeird = plan({
      beats: [
        { ms: 10_000, kind: "reaction" },
        { ms: 10_500, kind: "weird", x: 0.5, y: 0.5 },
      ],
    })
    expect(withWeird.map((e) => e.kind)).toEqual(["focus"])
    const twoReactions = plan({
      beats: [
        { ms: 10_000, kind: "reaction" },
        { ms: 10_800, kind: "reaction" },
      ],
    })
    expect(twoReactions).toEqual([
      { kind: "focus", startMs: 9700, endMs: 11_500, target: "cam" },
    ])
  })

  it("caps beat-driven events by gap and focus budget", () => {
    const beats = Array.from({ length: 10 }, (_, i) => ({
      ms: 1000 + i * 1000,
      kind: "reaction" as const,
    }))
    const events = plan({ endMs: 10_000, beats })
    const starts = events.map((e) => e.startMs)
    starts.forEach((start, i) => {
      if (i > 0) {
        expect(start - starts[i - 1]!).toBeGreaterThanOrEqual(PLANNER.minGapMs)
      }
    })
    const focusMs = events.reduce((sum, e) => sum + e.endMs - e.startMs, 0)
    expect(focusMs).toBeLessThanOrEqual(10_000 * PLANNER.maxFocusShare)
    expect(events).toHaveLength(2)
  })

  it("keeps shake cap when beats already used the budget", () => {
    const peaks = Array.from({ length: 10 }, (_, i) => ({
      ms: 2000 + i * 3000,
      lufs: -10,
    }))
    const events = plan({
      hasWebcam: false,
      signals: signalsWith(peaks),
      beats: [{ ms: 1000, kind: "weird", x: 0.5, y: 0.5 }],
    })
    expect(events.filter((e) => e.kind === "shake")).toHaveLength(
      PLANNER.maxShakes
    )
    expect(events.filter((e) => e.kind === "zoom")).toHaveLength(1)
  })

  it("keeps a jump zoom out of the first 500 ms", () => {
    const signals = signalsWith([{ ms: 1750, lufs: -30 }], -45)
    expect(plan({ startMs: 1000, signals })).toEqual([])
    expect(plan({ startMs: 0, signals })).toHaveLength(1)
  })

  it("ignores loudness peaks outside the clip when snapping a beat", () => {
    const events = plan({
      startMs: 10_000,
      endMs: 30_000,
      signals: signalsWith([{ ms: 8000, lufs: -10 }]),
      beats: [{ ms: 10_500, kind: "reaction" }],
    })
    expect(events).toEqual([
      { kind: "focus", startMs: 10_200, endMs: 12_000, target: "cam" },
    ])
  })
})
