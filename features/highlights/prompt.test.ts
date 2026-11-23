import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords } from "../transcription/normalize"
import { buildSelectionPrompt, chunkRanges, languageName } from "./prompt"

const words = normalizeWords([
  { text: " Meu", startMs: 0, endMs: 400, confidence: 0.95 },
  { text: " deus!", startMs: 500, endMs: 900, confidence: 0.95 },
  { text: " Get", startMs: 40_000, endMs: 40_400, confidence: 0.2 },
  { text: " down.", startMs: 40_500, endMs: 40_900, confidence: 0.3 },
])
const base = {
  durationMs: 60_000,
  words,
  segments: buildSegments(words),
  signals: {
    silences: [{ startMs: 10_000, endMs: 12_000 }],
    loudness: Array.from({ length: 240 }, () => -20),
    loudnessIntervalMs: 250,
    speechDensity: [],
  },
  limits: { minMs: 15_000, maxMs: 30_000, maxCount: 3 },
  language: "pt",
}

describe("selection prompt", () => {
  it("names the spoken language and marks unclear speech", () => {
    const prompt = buildSelectionPrompt(base)
    expect(languageName("pt")).toBe("Portuguese")
    expect(prompt).toContain("The streamer speaks Portuguese.")
    expect(prompt).toContain("Write titles and hooks in Portuguese.")
    expect(prompt).toContain("[0.0–0.9] Meu deus!")
    expect(prompt).toMatch(/\[40\.0–40\.9\] \(unclear\) Get down\./)
  })

  it("limits a part to its own time range", () => {
    const prompt = buildSelectionPrompt({
      ...base,
      part: { index: 1, count: 2, startMs: 30_000, endMs: 60_000 },
    })
    expect(prompt).toContain("This is part 2 of 2, from 30.0 s to 60.0 s")
    expect(prompt).not.toContain("Meu deus!")
    expect(prompt).toContain("Silences: none")
  })
})

describe("chunkRanges", () => {
  it("keeps short transcripts whole", () => {
    expect(chunkRanges(base.segments, 60_000)).toEqual([
      { startMs: 0, endMs: 60_000 },
    ])
  })

  it("splits long transcripts into overlapping parts that cover everything", () => {
    const segments = Array.from({ length: 1000 }, (_, i) => ({
      text: "x".repeat(200),
      startMs: i * 10_000,
      endMs: i * 10_000 + 9_000,
      firstWord: i,
      lastWord: i,
    }))
    const ranges = chunkRanges(segments, 10_000_000)
    expect(ranges.length).toBe(4)
    expect(ranges[0]!.startMs).toBe(0)
    expect(ranges.at(-1)!.endMs).toBe(10_000_000)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.startMs).toBeLessThan(ranges[i - 1]!.endMs)
    }
  })
})

describe("rewatched ranges", () => {
  it("lists the most replayed parts above the median, in order", () => {
    const prompt = buildSelectionPrompt({
      ...base,
      audience: [
        { startMs: 0, endMs: 20_000, value: 0.2 },
        { startMs: 20_000, endMs: 40_000, value: 1 },
        { startMs: 40_000, endMs: 60_000, value: 0.3 },
      ],
    })
    expect(prompt).toContain(
      "Most rewatched on YouTube (viewer replays, 1 = the most replayed part of the video; each range is coarse, so find the moment inside it): 20.0–40.0s (1.00)"
    )
  })

  it("says nothing without a heatmap", () => {
    expect(buildSelectionPrompt(base)).not.toContain("rewatched")
  })
})
