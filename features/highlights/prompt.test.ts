import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords } from "../transcription/normalize"
import { NICHE_PROFILES } from "./niches"
import {
  buildSelectionPrompt,
  chunkRanges,
  buildManualPrompt,
  languageName,
  parseCandidatesJson,
} from "./prompt"

const words = normalizeWords([
  { text: " Meu", startMs: 0, endMs: 400, confidence: 0.95 },
  { text: " deus!", startMs: 500, endMs: 900, confidence: 0.95 },
  { text: " Get", startMs: 40_000, endMs: 40_400, confidence: 0.2 },
  { text: " down.", startMs: 40_500, endMs: 40_900, confidence: 0.3 },
  { text: " Vai", startMs: 50_000, endMs: 50_400, confidence: 0.2 },
  { text: " lá.", startMs: 50_500, endMs: 50_900, confidence: 0.3 },
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
  it("lists what hooks viewers in the niche and asks for payoff starts", () => {
    const prompt = buildSelectionPrompt({ ...base, niche: NICHE_PROFILES.gta })
    expect(prompt).toContain(
      "The game is GTA. For this niche, look hardest for:"
    )
    expect(prompt).toContain("- bugs and glitches")
    expect(prompt).toContain("start on the payoff")
    expect(buildSelectionPrompt(base)).not.toContain("The game is")
  })

  it("names the spoken language and marks game and unclear speech", () => {
    const prompt = buildSelectionPrompt(base)
    expect(languageName("pt")).toBe("Portuguese")
    expect(prompt).toContain("The streamer speaks Portuguese.")
    expect(prompt).toContain("Write titles and hooks in Portuguese.")
    expect(prompt).toContain("[0.0–0.9] Meu deus!")
    expect(prompt).toContain("[40.0–40.9] (game) Get down.")
    expect(prompt).toContain("[50.0–50.9] (unclear) Vai lá.")
  })

  it("lists game dialogue stretches and runs of camera cuts", () => {
    const english = normalizeWords(
      Array.from({ length: 60 }, (_, i) => ({
        text: i % 6 === 5 ? " you." : " you",
        startMs: 10_000 + i * 500,
        endMs: 10_000 + i * 500 + 300,
      }))
    )
    const prompt = buildSelectionPrompt({
      ...base,
      words: english,
      segments: buildSegments(english),
      signals: { ...base.signals, cuts: [2000, 6000, 9000, 30_000] },
    })
    expect(prompt).toContain(
      "Game characters talking, likely cutscenes: 10.0–40.0s"
    )
    expect(prompt).toMatch(/Runs of hard camera cuts .*: 2\.0–9\.0s \(3 cuts\)/)
  })

  it("leaves out the cut and dialogue lines when there are none", () => {
    const prompt = buildSelectionPrompt(base)
    expect(prompt).not.toContain("Game characters talking")
    expect(prompt).not.toContain("Runs of hard camera cuts")
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

describe("manual prompt", () => {
  it("includes the most replayed ranges and the reply format", () => {
    const prompt = buildManualPrompt({
      ...base,
      audience: [
        { startMs: 0, endMs: 6000, value: 0.2 },
        { startMs: 6000, endMs: 12_000, value: 1 },
        { startMs: 12_000, endMs: 18_000, value: 0.4 },
      ],
    })
    expect(prompt).toContain("Most rewatched on YouTube")
    expect(prompt).toContain("6.0–12.0s (1.00)")
    expect(prompt).toContain("Reply with only JSON in this shape")
  })
})

describe("parseCandidatesJson", () => {
  it.each([
    ["no object", "nothing here", /starts with/],
    ["broken JSON", "{clips: [}", /isn't valid JSON/],
    [
      "the wrong shape",
      '{"clips":[{"title":"x"}]}',
      /expected shape \(clips\.0\.startMs/,
    ],
  ])("explains %s", (_, text, message) => {
    expect(() => parseCandidatesJson(text)).toThrow(message)
  })
})
