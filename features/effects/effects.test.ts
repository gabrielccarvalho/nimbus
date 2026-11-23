import { describe, expect, it } from "vitest"

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
