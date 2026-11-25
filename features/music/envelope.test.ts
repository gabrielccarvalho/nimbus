import { describe, expect, it } from "vitest"
import {
  dbToGain,
  duckDbAt,
  musicGainAt,
  planAudio,
  speechIntervals,
} from "./envelope"
import { DEFAULT_AUDIO_MIX, audioMixSchema } from "./schema"

const w = (startMs: number, endMs: number, text = "word") => ({
  text,
  startMs,
  endMs,
})

describe("speechIntervals", () => {
  it("merges gaps under 400 ms and keeps longer ones", () => {
    expect(speechIntervals([w(0, 300), w(600, 900)], 10_000)).toEqual([
      { startMs: 0, endMs: 900 },
    ])
    expect(speechIntervals([w(0, 300), w(700, 900)], 10_000)).toEqual([
      { startMs: 0, endMs: 300 },
      { startMs: 700, endMs: 900 },
    ])
  })
  it("trims a word stretched over a pause like the captions do", () =>
    expect(speechIntervals([w(1000, 5000, "so")], 10_000)).toEqual([
      { startMs: 1000, endMs: 1460 },
    ]))
  it("clamps to the clip", () =>
    expect(speechIntervals([w(9_800, 10_400, "end")], 10_000)).toEqual([
      { startMs: 9_800, endMs: 10_000 },
    ]))
})

describe("duckDbAt", () => {
  it("ramps 200 ms into and out of speech", () => {
    const speech = [{ startMs: 1000, endMs: 2000 }]
    expect(duckDbAt(speech, 800)).toBe(0)
    expect(duckDbAt(speech, 900)).toBeCloseTo(-5)
    expect(duckDbAt(speech, 1000)).toBe(-10)
    expect(duckDbAt(speech, 1500)).toBe(-10)
    expect(duckDbAt(speech, 2100)).toBeCloseTo(-5)
    expect(duckDbAt(speech, 2200)).toBe(0)
    expect(duckDbAt([{ startMs: 0, endMs: 500 }], 0)).toBe(-10)
  })
})

const mix = { ...DEFAULT_AUDIO_MIX, trackId: "t1" }

describe("planAudio", () => {
  it("plans nothing without a mix and only the source without a track", () => {
    expect(planAudio(null, null, 15_000, [])).toBeNull()
    expect(
      planAudio({ ...DEFAULT_AUDIO_MIX, sourceDb: 4 }, null, 15_000, [])
    ).toEqual({ sourceDb: 4, music: null })
  })
  it("ends the music with the track and fits the fades into what is left", () => {
    const plan = planAudio(
      { ...mix, trackStartMs: 12_000, fadeInMs: 500 },
      { durationMs: 20_000 },
      15_000,
      []
    )
    expect(plan?.music).toEqual({
      musicDb: -16,
      lengthMs: 8_000,
      fadeInMs: 500,
      fadeOutMs: 1_500,
      duck: [],
    })
    expect(
      planAudio(
        { ...mix, trackStartMs: 19_000, fadeInMs: 800, fadeOutMs: 1_500 },
        { durationMs: 20_000 },
        15_000,
        []
      )?.music
    ).toMatchObject({ lengthMs: 1_000, fadeInMs: 800, fadeOutMs: 200 })
    expect(
      planAudio(
        { ...mix, trackStartMs: 20_000 },
        { durationMs: 20_000 },
        15_000,
        []
      )
    ).toEqual({ sourceDb: 0, music: null })
  })
  it("ducks only when asked", () => {
    const words = [w(1000, 1300)]
    expect(
      planAudio(mix, { durationMs: 60_000 }, 15_000, words)?.music?.duck
    ).toEqual([{ startMs: 1000, endMs: 1300 }])
    expect(
      planAudio({ ...mix, duck: false }, { durationMs: 60_000 }, 15_000, words)
        ?.music?.duck
    ).toEqual([])
  })
})

describe("musicGainAt", () => {
  it("gives the preview the render's gain", () => {
    const plan = {
      musicDb: -16,
      lengthMs: 10_000,
      fadeInMs: 500,
      fadeOutMs: 1_000,
      duck: [{ startMs: 3_000, endMs: 4_000 }],
    }
    expect(musicGainAt(plan, 0)).toBe(0)
    expect(musicGainAt(plan, 250)).toBeCloseTo(0.5 * dbToGain(-16))
    expect(musicGainAt(plan, 2_000)).toBeCloseTo(dbToGain(-16))
    expect(musicGainAt(plan, 3_500)).toBeCloseTo(dbToGain(-26))
    expect(musicGainAt(plan, 9_500)).toBeCloseTo(0.5 * dbToGain(-16))
    expect(musicGainAt(plan, 10_000)).toBe(0)
  })
})

describe("audioMixSchema", () => {
  it("fills the defaults", () =>
    expect(audioMixSchema.parse({ trackId: "t1" })).toEqual({
      ...DEFAULT_AUDIO_MIX,
      trackId: "t1",
    }))
  it.each([
    { musicDb: 1 },
    { musicDb: -16.5 },
    { sourceDb: 7 },
    { fadeOutMs: 5001 },
  ])("rejects %o", (bad) =>
    expect(audioMixSchema.safeParse({ trackId: "t1", ...bad }).success).toBe(
      false
    )
  )
})
