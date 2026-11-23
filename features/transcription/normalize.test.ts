import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords, type RawToken } from "./normalize"
import {
  parseWhisperJson,
  parseWhisperProgress,
  parseWhisperSegmentLine,
} from "./whisper-parse"

const t = (
  text: string,
  startMs: number,
  endMs: number,
  confidence?: number
): RawToken => ({
  text,
  startMs,
  endMs,
  confidence,
})

describe("normalizeWords", () => {
  it("trims, drops empties and merges punctuation and sub-words", () => {
    expect(
      normalizeWords([
        t(" Hello", 0, 300, 0.9),
        t(",", 300, 320, 0.7),
        t(" ", 320, 330),
        t(" wor", 400, 500, 0.8),
        t("ld", 500, 600, 0.6),
        t("!", 600, 610, 1),
      ])
    ).toEqual([
      { text: "Hello,", startMs: 0, endMs: 320, confidence: 0.8 },
      { text: "world!", startMs: 400, endMs: 610, confidence: 0.8 },
    ])
  })

  it("keeps the first token even without a leading space", () => {
    expect(
      normalizeWords([t("Okay", 0, 100), t(" go", 120, 200)]).map((w) => w.text)
    ).toEqual(["Okay", "go"])
  })

  it("sorts by start and resolves overlaps", () => {
    const words = normalizeWords([
      t(" b", 500, 900),
      t(" a", 0, 700),
      t(" c", 800, 1000),
    ])
    expect(words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([
      ["a", 0, 500],
      ["b", 500, 800],
      ["c", 800, 1000],
    ])
  })

  it("clamps bad times and confidences", () => {
    expect(
      normalizeWords([
        t(" x", -50, -100, 3),
        t(" y", 10, Number.NaN),
        t(" z", 20, 30, -1),
      ])
    ).toEqual([
      { text: "x", startMs: 0, endMs: 0, confidence: 1 },
      { text: "z", startMs: 20, endMs: 30, confidence: 0 },
    ])
  })

  it("keeps timestamps monotonic for random input", () => {
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let run = 0; run < 50; run++) {
      const tokens = Array.from({ length: 40 }, () => {
        const start = Math.floor(rand() * 10_000)
        return t(
          rand() > 0.2 ? " w" : ".",
          start,
          start + Math.floor(rand() * 800)
        )
      })
      const words = normalizeWords(tokens)
      for (let i = 0; i < words.length; i++) {
        expect(words[i]!.endMs).toBeGreaterThanOrEqual(words[i]!.startMs)
        if (i > 0)
          expect(words[i]!.startMs).toBeGreaterThanOrEqual(words[i - 1]!.endMs)
      }
    }
  })
})

describe("buildSegments", () => {
  const words = normalizeWords([
    t(" Hi", 0, 200),
    t(" there.", 250, 500),
    t(" What", 600, 800),
    t(" now", 850, 1000),
    t(" ok", 2500, 2700),
  ])

  it("splits on sentence ends and long gaps", () => {
    expect(buildSegments(words)).toEqual([
      { text: "Hi there.", startMs: 0, endMs: 500, firstWord: 0, lastWord: 1 },
      {
        text: "What now",
        startMs: 600,
        endMs: 1000,
        firstWord: 2,
        lastWord: 3,
      },
      { text: "ok", startMs: 2500, endMs: 2700, firstWord: 4, lastWord: 4 },
    ])
  })

  it("handles empty input", () => {
    expect(buildSegments([])).toEqual([])
  })
})

describe("parseWhisperJson", () => {
  const sample = JSON.stringify({
    result: { language: "en" },
    transcription: [
      {
        offsets: { from: 0, to: 600 },
        text: " Hello world",
        tokens: [
          { text: "[_BEG_]", offsets: { from: 0, to: 0 }, p: 1 },
          { text: " Hello", offsets: { from: 0, to: 300 }, p: 0.95 },
          { text: " world", offsets: { from: 300, to: 600 }, p: 0.9 },
          { text: "[_TT_30]", offsets: { from: 600, to: 600 }, p: 1 },
        ],
      },
      { offsets: { from: 700, to: 900 }, text: " bye" },
      { offsets: { from: 900, to: 950 }, text: " [BLANK_AUDIO]" },
    ],
  })

  it("extracts real tokens and language", () => {
    expect(parseWhisperJson(sample)).toEqual({
      language: "en",
      tokens: [
        { text: " Hello", startMs: 0, endMs: 300, confidence: 0.95 },
        { text: " world", startMs: 300, endMs: 600, confidence: 0.9 },
        { text: " bye", startMs: 700, endMs: 900, confidence: undefined },
      ],
    })
  })

  it("rejects invalid output", () => {
    expect(() => parseWhisperJson("{")).toThrow(/invalid JSON/)
    expect(() => parseWhisperJson("{}")).toThrow(/Unexpected/)
  })

  it("defaults the language", () => {
    expect(
      parseWhisperJson(JSON.stringify({ transcription: [] })).language
    ).toBe("unknown")
  })

  it("parses progress lines", () => {
    expect(
      parseWhisperProgress("whisper_print_progress_callback: progress =  45%")
    ).toBe(45)
    expect(parseWhisperProgress("nothing here")).toBeNull()
  })

  it("parses the words whisper prints while it works", () => {
    expect(
      parseWhisperSegmentLine("[01:02:03.450 --> 01:02:03.900]   Corre,")
    ).toEqual({ startMs: 3_723_450, text: "Corre," })
    expect(
      parseWhisperSegmentLine("[00:00:00.000 --> 00:00:00.010]  ")
    ).toBeNull()
    expect(parseWhisperSegmentLine("whisper_init_from_file")).toBeNull()
  })
})
