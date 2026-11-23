import { describe, expect, it } from "vitest"

import { createCutParser, cutClusters } from "./cuts"
import { computeSpeechDensity } from "./density"
import { createLoudnessCollector, normalizeLoudness } from "./loudness"
import { createSilenceParser } from "./silence"

const silenceLog = `
[Parsed_silencedetect_0 @ 0x7829038b40] silence_start: 4.010667
[Parsed_ebur128_1 @ 0x7829038c00] t: 4.1  TARGET:-23 LUFS    M:-120.7 S:-120.7
[Parsed_silencedetect_0 @ 0x7829038b40] silence_end: 6.016 | silence_duration: 2.005333
[Parsed_silencedetect_0 @ 0x7829038b40] silence_start: 12.010667
[Parsed_silencedetect_0 @ 0x7829038b40] silence_end: 13.504 | silence_duration: 1.493333
[Parsed_silencedetect_0 @ 0x7829038b40] silence_start: 19.2
`

describe("silence parser", () => {
  it("pairs starts and ends and closes a trailing silence at the duration", () => {
    const parser = createSilenceParser()
    silenceLog.split("\n").forEach(parser.push)
    expect(parser.finish(20_000)).toEqual([
      { startMs: 4011, endMs: 6016 },
      { startMs: 12011, endMs: 13504 },
      { startMs: 19200, endMs: 20000 },
    ])
  })

  it("ignores orphan ends, negative starts and zero-length ranges", () => {
    const parser = createSilenceParser()
    ;[
      "silence_end: 1 | silence_duration: 1",
      "silence_start: -0.002",
      "silence_end: 0.8 | silence_duration: 0.8",
      "silence_start: 5",
      "silence_end: 5 | silence_duration: 0",
    ].forEach(parser.push)
    expect(parser.finish(10_000)).toEqual([{ startMs: 0, endMs: 800 }])
  })

  it("clamps ranges past the duration", () => {
    const parser = createSilenceParser()
    ;[
      "silence_start: 9.5",
      "silence_end: 10.4 | silence_duration: 0.9",
    ].forEach(parser.push)
    expect(parser.finish(10_000)).toEqual([{ startMs: 9500, endMs: 10_000 }])
  })
})

describe("loudness collector", () => {
  const line = (t: number, m: string) =>
    `[Parsed_ebur128_1 @ 0x1] t: ${t}  TARGET:-23 LUFS    M:${m} S:-20.0     I: -21.8 LUFS       LRA:   0.0 LU`

  it("keeps the max momentary loudness per bucket and floors silence", () => {
    const collector = createLoudnessCollector(250)
    ;[
      line(0.0999, "-120.7"),
      line(0.1999, "-30.2"),
      line(0.2999, " -21.7"),
      line(0.3999, "-25"),
      line(0.6, "-inf"),
      "garbage",
    ].forEach(collector.push)
    expect(collector.finish(1000)).toEqual([-30.2, -21.7, -70, -70])
  })

  it("sizes the series to the duration", () => {
    const collector = createLoudnessCollector(250)
    collector.push(line(5, "-10"))
    expect(collector.finish(1100)).toHaveLength(5)
  })

  it("normalizes audible values to 0–1", () => {
    expect(normalizeLoudness([-70, -30, -20, -10])).toEqual([0, 0, 0.5, 1])
    expect(normalizeLoudness([-70, -70])).toEqual([0, 0])
    expect(normalizeLoudness([-70, -15, -15])).toEqual([0, 1, 1])
  })
})

describe("speech density", () => {
  const words = Array.from({ length: 30 }, (_, i) => ({
    startMs: i * 500,
    endMs: i * 500 + 400,
  }))

  it("counts words per second in sliding windows", () => {
    expect(computeSpeechDensity(words, 20_000)).toEqual([
      { startMs: 0, endMs: 10_000, wordsPerSecond: 2 },
      { startMs: 5000, endMs: 15_000, wordsPerSecond: 2 },
      { startMs: 10_000, endMs: 20_000, wordsPerSecond: 1 },
    ])
  })

  it("handles short and empty media", () => {
    expect(computeSpeechDensity([], 3000)).toEqual([
      { startMs: 0, endMs: 3000, wordsPerSecond: 0 },
    ])
    expect(computeSpeechDensity(words, 0)).toEqual([])
  })
})

describe("cut parser", () => {
  it("collects selected frame times and ignores other log lines", () => {
    const parser = createCutParser()
    ;[
      "[Parsed_metadata_3 @ 0x6000] frame:0    pts:322     pts_time:32.2",
      "[Parsed_metadata_3 @ 0x6000] lavfi.scene_score=0.292587",
      "[Parsed_ebur128_1 @ 0x7829] t: 4.1  TARGET:-23 LUFS    M:-120.7",
      "[Parsed_metadata_3 @ 0x6000] frame:1    pts:107     pts_time:10.7",
      "[Parsed_metadata_3 @ 0x6000] frame:2    pts:107     pts_time:10.7",
      "[Parsed_metadata_3 @ 0x6000] frame:3    pts:990     pts_time:99",
    ].forEach(parser.push)
    expect(parser.finish(60_000)).toEqual([10_700, 32_200])
  })
})

describe("cutClusters", () => {
  it("groups cuts at most 10 s apart and keeps groups of three or more", () => {
    expect(
      cutClusters([1000, 5000, 14_000, 40_000, 45_000, 80_000, 82_000, 84_000])
    ).toEqual([
      { startMs: 1000, endMs: 14_000, count: 3 },
      { startMs: 80_000, endMs: 84_000, count: 3 },
    ])
  })
})
