import { describe, expect, it } from "vitest"

import {
  markerRatios,
  retentionMoments,
  statsEarly,
  statsSyncDue,
} from "./stats"

const day = 86_400_000
const at = new Date("2026-11-01T12:00:00Z")
const nimbus = { publishedAt: at, origin: "nimbus" as const }
const imported = { publishedAt: at, origin: "imported" as const }
const plus = (ms: number) => new Date(at.getTime() + ms)

describe("stats", () => {
  it("keeps days 1, 2, 7, 28, then re-syncs every 28 days", () => {
    expect(statsSyncDue(nimbus, null, plus(day - 1))).toBe(false)
    expect(statsSyncDue(nimbus, null, plus(day))).toBe(true)
    expect(statsSyncDue(nimbus, plus(day), plus(day + 1))).toBe(false)
    expect(statsSyncDue(nimbus, plus(day), plus(2 * day))).toBe(true)
    expect(statsSyncDue(nimbus, plus(28 * day), plus(56 * day - 1))).toBe(false)
    expect(statsSyncDue(nimbus, plus(28 * day), plus(56 * day))).toBe(true)
  })

  it("syncs imported Shorts at once, then every 28 days", () => {
    expect(statsSyncDue(imported, null, plus(400 * day))).toBe(true)
    expect(statsSyncDue(imported, plus(400 * day), plus(427 * day))).toBe(false)
    expect(statsSyncDue(imported, plus(400 * day), plus(428 * day))).toBe(true)
  })

  it("labels the first 72 hours as early", () => {
    expect(statsEarly(at, plus(71 * 3_600_000))).toBe(true)
    expect(statsEarly(at, plus(72 * 3_600_000))).toBe(false)
  })

  it("finds the steepest drops in clip time with what was said and shown", () => {
    const curve = Array.from({ length: 100 }, (_, i) => ({
      ratio: (i + 1) / 100,
      watch: i < 30 ? 1 : i < 31 ? 0.6 : 0.6 - i * 0.001,
    }))
    const moments = retentionMoments(
      curve,
      { startMs: 10_000, endMs: 30_000 },
      {
        words: [
          { text: "wait", startMs: 16_000, endMs: 16_300, confidence: 1 },
        ],
        beats: [{ ms: 16_100, kind: "reaction" }],
        effects: [
          {
            kind: "zoom",
            startMs: 15_500,
            endMs: 17_000,
            scale: 1.4,
            focus: { x: 0.5, y: 0.5 },
          },
        ],
      }
    )
    expect(moments[0]).toMatchObject({
      kind: "drop",
      atMs: 6_200,
      words: "wait",
      beats: ["reaction"],
      effects: ["zoom"],
    })
    expect(moments[0]!.change).toBeCloseTo(-0.4)
  })

  it("returns no moments for an empty curve", () => {
    expect(
      retentionMoments(
        [],
        { startMs: 0, endMs: 10_000 },
        { words: [], beats: [], effects: [] }
      )
    ).toEqual([])
  })

  it("places beats as fractions of the uploaded range", () => {
    expect(
      markerRatios({ startMs: 10_000, endMs: 20_000 }, [
        { ms: 15_000, kind: "weird" },
        { ms: 25_000, kind: "weird" },
      ])
    ).toEqual([0.5])
  })
})
