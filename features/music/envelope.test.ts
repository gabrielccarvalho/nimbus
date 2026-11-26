import { describe, expect, it } from "vitest"
import {
  dbToGain,
  duckDbAt,
  musicGainAt,
  planAudio,
  speechIntervals,
} from "./envelope"
import { DEFAULT_AUDIO_MIX, audioMixSchema, newMusicClip } from "./schema"

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

const clip = newMusicClip("t1", { startMs: 0, endMs: 15_000, lane: 0 })
const mix = { ...DEFAULT_AUDIO_MIX, music: [clip] }
const tracks = (durationMs: number) => new Map([["t1", { durationMs }]])

describe("planAudio", () => {
  it("plans nothing without a mix and only the source without music", () => {
    expect(planAudio(null, new Map(), 15_000, [])).toBeNull()
    expect(
      planAudio({ ...DEFAULT_AUDIO_MIX, sourceDb: 4 }, new Map(), 15_000, [])
    ).toEqual({ sourceDb: 4, music: [] })
    expect(
      planAudio(
        { ...DEFAULT_AUDIO_MIX, sourceMuted: true },
        new Map(),
        15_000,
        []
      )
    ).toEqual({ sourceDb: null, music: [] })
  })
  it("ends the music with the track and fits the fades into what is left", () => {
    const plan = planAudio(
      { ...mix, music: [{ ...clip, inMs: 12_000, fadeInMs: 500 }] },
      tracks(20_000),
      15_000,
      []
    )
    expect(plan?.music).toEqual([
      {
        trackId: "t1",
        startMs: 0,
        inMs: 12_000,
        musicDb: -16,
        lengthMs: 8_000,
        fadeInMs: 500,
        fadeOutMs: 1_500,
        duck: [],
      },
    ])
    expect(
      planAudio(
        {
          ...mix,
          music: [{ ...clip, inMs: 19_000, fadeInMs: 800, fadeOutMs: 1_500 }],
        },
        tracks(20_000),
        15_000,
        []
      )?.music[0]
    ).toMatchObject({ lengthMs: 1_000, fadeInMs: 800, fadeOutMs: 200 })
    expect(
      planAudio(
        { ...mix, music: [{ ...clip, inMs: 20_000 }] },
        tracks(20_000),
        15_000,
        []
      )
    ).toEqual({ sourceDb: 0, music: [] })
  })
  it("plays each clip from its start until its end or the clip's end", () => {
    const plan = planAudio(
      {
        ...mix,
        music: [
          { ...clip, startMs: 2_000, endMs: 6_000 },
          { ...clip, startMs: 10_000, endMs: 30_000, lane: 1 },
        ],
      },
      tracks(60_000),
      15_000,
      []
    )
    expect(
      plan?.music.map(({ startMs, lengthMs }) => [startMs, lengthMs])
    ).toEqual([
      [2_000, 4_000],
      [10_000, 5_000],
    ])
  })
  it("skips music whose track isn't known", () =>
    expect(planAudio(mix, new Map(), 15_000, [])?.music).toEqual([]))
  it("ducks only when asked, in each clip's own time", () => {
    const words = [w(5000, 5300)]
    expect(
      planAudio(
        { ...mix, music: [{ ...clip, startMs: 4_000 }] },
        tracks(60_000),
        15_000,
        words
      )?.music[0]?.duck
    ).toEqual([{ startMs: 1000, endMs: 1300 }])
    expect(
      planAudio({ ...mix, duck: false }, tracks(60_000), 15_000, words)
        ?.music[0]?.duck
    ).toEqual([])
  })
})

describe("musicGainAt", () => {
  it("gives the preview the render's gain", () => {
    const plan = {
      trackId: "t1",
      startMs: 0,
      inMs: 0,
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
  it("fills the defaults", () => {
    expect(audioMixSchema.parse({})).toEqual(DEFAULT_AUDIO_MIX)
    expect(
      audioMixSchema.parse({
        music: [{ trackId: "t1", startMs: 0, endMs: 5000 }],
      }).music
    ).toEqual([newMusicClip("t1", { startMs: 0, endMs: 5000, lane: 0 })])
  })
  it.each([
    { db: 1 },
    { db: -16.5 },
    { fadeOutMs: 5001 },
    { endMs: 499 },
    { lane: 4 },
  ])("rejects a music clip with %o", (bad) =>
    expect(
      audioMixSchema.safeParse({
        music: [{ trackId: "t1", startMs: 0, endMs: 5000, ...bad }],
      }).success
    ).toBe(false)
  )
  it("rejects a source volume over 6 dB", () =>
    expect(audioMixSchema.safeParse({ sourceDb: 7 }).success).toBe(false))
})
