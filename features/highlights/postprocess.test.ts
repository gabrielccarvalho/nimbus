import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords } from "../transcription/normalize"
import { HeuristicSelector, scoreWindows } from "./heuristic"
import { postprocessCandidates } from "./postprocess"
import type { RawCandidate } from "./types"

const words = normalizeWords(
  Array.from({ length: 120 }, (_, i) => ({
    text: i % 10 === 9 ? " end." : " word",
    startMs: i * 1000,
    endMs: i * 1000 + 600,
  }))
)
const segments = buildSegments(words)
const limits = { minMs: 15_000, maxMs: 60_000, maxCount: 3 }
const context = { durationMs: 120_000, words, segments, limits }

const raw = (startMs: number, endMs: number, score = 0.5): RawCandidate => ({
  startMs,
  endMs,
  title: " A clip ",
  hook: "hook",
  reason: "why",
  score,
})

describe("postprocessCandidates", () => {
  it("lowers the score of clips covered by game dialogue", () => {
    const dialogue = normalizeWords(
      Array.from({ length: 120 }, (_, i) => ({
        text: i < 60 ? " you" : i % 10 === 9 ? " fim." : " vai",
        startMs: i * 1000,
        endMs: i * 1000 + 600,
      }))
    )
    const clips = postprocessCandidates(
      [raw(0, 30_000, 0.9), raw(70_000, 100_000, 0.6)],
      {
        ...context,
        words: dialogue,
        segments: buildSegments(dialogue),
        language: "pt",
      }
    )
    expect(clips.map((c) => [c.startMs, c.score])).toEqual([
      [70_000, 0.6],
      [0, expect.closeTo(0.9 * (1 - 0.6), 5)],
    ])
  })

  it("keeps a reviewed payoff start, snapped only to the nearest word", () => {
    const [clip] = postprocessCandidates([raw(10_900, 30_200)], {
      ...context,
      payoffStarts: true,
    })
    expect(clip).toMatchObject({ startMs: 11_000, endMs: 29_600 })
    const [far] = postprocessCandidates([raw(12_450, 30_200)], {
      ...context,
      payoffStarts: true,
    })
    expect(far!.startMs).toBe(12_450)
  })

  it("snaps to sentence boundaries within 1.5 s", () => {
    const [clip] = postprocessCandidates([raw(10_900, 30_200)], context)
    expect(clip).toMatchObject({
      startMs: 10_000,
      endMs: 29_600,
      title: "A clip",
    })
  })

  it("falls back to the nearest word boundary", () => {
    const [clip] = postprocessCandidates([raw(14_400, 33_700)], context)
    expect(clip).toMatchObject({ startMs: 14_000, endMs: 33_600 })
  })

  it("extends short clips and trims long ones on word boundaries", () => {
    const [short] = postprocessCandidates([raw(20_000, 25_000)], context)
    expect(short!.endMs - short!.startMs).toBeGreaterThanOrEqual(15_000)
    expect(words.some((w) => w.endMs === short!.endMs)).toBe(true)
    const [long] = postprocessCandidates([raw(0, 100_000)], context)
    expect(long!.endMs - long!.startMs).toBeLessThanOrEqual(60_000)
    expect(words.some((w) => w.endMs === long!.endMs)).toBe(true)
  })

  it("clamps to media bounds and shifts back near the end", () => {
    const [clip] = postprocessCandidates([raw(112_000, 140_000)], context)
    expect(clip!.endMs).toBeLessThanOrEqual(120_000)
    expect(clip!.endMs - clip!.startMs).toBeGreaterThanOrEqual(15_000)
  })

  it("drops invalid candidates and clamps scores", () => {
    expect(
      postprocessCandidates(
        [raw(Number.NaN, 20_000), raw(50_000, 40_000), raw(0, 20_000, 7)],
        context
      ).map((c) => c.score)
    ).toEqual([1])
  })

  it("removes overlaps above 20% greedily by score and caps the count", () => {
    const result = postprocessCandidates(
      [
        raw(0, 20_000, 0.4),
        raw(10_000, 30_000, 0.9),
        raw(40_000, 60_000, 0.5),
        raw(60_000, 80_000, 0.6),
        raw(80_000, 100_000, 0.3),
        raw(100_000, 119_600, 0.2),
      ],
      context
    )
    expect(result.map((c) => c.score)).toEqual([0.9, 0.6, 0.5])
  })

  it("never returns overlapping or out-of-bounds clips for random input", () => {
    let seed = 3
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let run = 0; run < 100; run++) {
      const input = Array.from({ length: 20 }, () => {
        const start = rand() * 140_000 - 10_000
        return raw(start, start + rand() * 90_000, rand())
      })
      const result = postprocessCandidates(input, {
        ...context,
        limits: { ...limits, maxCount: 12 },
      })
      for (const clip of result) {
        expect(clip.startMs).toBeGreaterThanOrEqual(0)
        expect(clip.endMs).toBeLessThanOrEqual(120_000)
        expect(clip.endMs - clip.startMs).toBeGreaterThanOrEqual(15_000)
        expect(clip.endMs - clip.startMs).toBeLessThanOrEqual(60_000)
      }
      for (const a of result) {
        for (const b of result) {
          if (a === b) continue
          const overlap =
            Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)
          expect(
            overlap / Math.min(a.endMs - a.startMs, b.endMs - b.startMs)
          ).toBeLessThanOrEqual(0.2)
        }
      }
      expect(result.map((c) => c.score)).toEqual(
        [...result.map((c) => c.score)].sort((a, b) => b - a)
      )
    }
  })
})

describe("description", () => {
  it("is trimmed and carried through, and stays unset when absent", () => {
    const [withText] = postprocessCandidates(
      [{ ...raw(10_000, 30_000), description: "  What happens.  " }],
      context
    )
    expect(withText!.description).toBe("What happens.")
    const [without] = postprocessCandidates([raw(10_000, 30_000)], context)
    expect(without).not.toHaveProperty("description")
  })
})

describe("beats", () => {
  it("survive postprocessing and are dropped when the range no longer contains them", () => {
    const beats = [
      { ms: 12_000, kind: "reaction" as const },
      { ms: 29_000, kind: "weird" as const, x: 0.5, y: 0.5 },
      { ms: 95_000, kind: "reaction" as const },
    ]
    const [clip] = postprocessCandidates([{ ...raw(10_000, 30_000), beats }], {
      ...context,
    })
    expect(clip!.beats).toEqual(beats.slice(0, 2))
    const [moved] = postprocessCandidates([{ ...raw(15_000, 30_000), beats }], {
      ...context,
    })
    expect(moved!.beats).toEqual([beats[1]])
  })
})

describe("excluded ranges", () => {
  it("drops candidates that overlap existing clips", () => {
    const words = normalizeWords(
      Array.from({ length: 60 }, (_, i) => ({
        text: i % 5 === 4 ? " done." : " word",
        startMs: i * 1000,
        endMs: i * 1000 + 500,
      }))
    )
    const result = postprocessCandidates(
      [
        {
          startMs: 0,
          endMs: 20_000,
          title: "a",
          hook: "",
          reason: "",
          score: 0.9,
        },
        {
          startMs: 30_000,
          endMs: 50_000,
          title: "b",
          hook: "",
          reason: "",
          score: 0.5,
        },
      ],
      {
        durationMs: 60_000,
        words,
        segments: buildSegments(words),
        limits: { minMs: 15_000, maxMs: 30_000, maxCount: 3 },
        exclude: [{ startMs: 2_000, endMs: 18_000 }],
      }
    )
    expect(result.map((c) => c.title)).toEqual(["b"])
  })
})

describe("heuristic selector", () => {
  it("prefers the loud, dense, hype window", async () => {
    const hypeWords = normalizeWords([
      ...Array.from({ length: 20 }, (_, i) => ({
        text: " calm",
        startMs: i * 2000,
        endMs: i * 2000 + 500,
      })),
      { text: " Wait,", startMs: 62_000, endMs: 62_400 },
      { text: " what?", startMs: 62_500, endMs: 63_000 },
      ...Array.from({ length: 30 }, (_, i) => ({
        text: i % 5 === 0 ? " insane!" : " go",
        startMs: 63_500 + i * 400,
        endMs: 63_800 + i * 400,
      })),
    ])
    const loudness = Array.from({ length: 480 }, (_, i) =>
      i >= 250 && i < 300 ? -8 : -30
    )
    const input = {
      durationMs: 120_000,
      words: hypeWords,
      segments: buildSegments(hypeWords),
      signals: {
        silences: [],
        loudness,
        loudnessIntervalMs: 250,
        speechDensity: [],
      },
      limits: { minMs: 15_000, maxMs: 30_000, maxCount: 3 },
      language: "en",
      reactionPhrases: [],
    }
    const [best] = postprocessCandidates(
      await new HeuristicSelector().select(input),
      input
    )
    expect(best!.startMs).toBeGreaterThanOrEqual(55_000)
    expect(best!.startMs).toBeLessThanOrEqual(63_000)
    expect(best!.reason).toMatch(/reaction phrases/)
    expect(best!.reason).toMatch(/question and answer/)
    expect(best!.hook).toBe("Wait, what?")
  })

  it("still proposes clips for silent media without a transcript", () => {
    const candidates = scoreWindows({
      durationMs: 40_000,
      words: [],
      segments: [],
      signals: {
        silences: [],
        loudness: Array(160).fill(-70),
        loudnessIntervalMs: 250,
        speechDensity: [],
      },
      limits: { minMs: 15_000, maxMs: 60_000, maxCount: 12 },
      language: "en",
      reactionPhrases: [],
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.score === 0)).toBe(true)
  })
})

describe("candidates joined from parts", () => {
  const joined = (
    parts: { startMs: number; endMs: number }[],
    score = 0.5
  ): RawCandidate => ({
    ...raw(parts[0]!.startMs, parts[0]!.endMs, score),
    parts,
  })

  it("snaps every part and puts the clip on its own timeline", () => {
    const [clip] = postprocessCandidates(
      [
        joined([
          { startMs: 80_200, endMs: 89_500 },
          { startMs: 9_900, endMs: 19_700 },
        ]),
      ],
      context
    )
    expect(clip).toMatchObject({
      startMs: 80_000,
      endMs: 80_000 + 9600 + 9600,
      parts: [
        { startMs: 80_000, endMs: 89_600 },
        { startMs: 10_000, endMs: 19_600 },
      ],
    })
  })

  it("drops parts that are too short or overlap an earlier one", () => {
    const [clip] = postprocessCandidates(
      [
        joined([
          { startMs: 0, endMs: 9_600 },
          { startMs: 5_000, endMs: 12_000 },
          { startMs: 30_000, endMs: 30_300 },
          { startMs: 50_000, endMs: 59_600 },
        ]),
      ],
      context
    )
    expect(clip?.parts).toEqual([
      { startMs: 0, endMs: 9_600 },
      { startMs: 50_000, endMs: 59_600 },
    ])
  })

  it("shortens from the end when the parts run over the limit", () => {
    const [clip] = postprocessCandidates(
      [
        joined([
          { startMs: 0, endMs: 29_600 },
          { startMs: 40_000, endMs: 69_600 },
          { startMs: 80_000, endMs: 99_600 },
        ]),
      ],
      context
    )
    expect(clip!.endMs - clip!.startMs).toBeLessThanOrEqual(limits.maxMs)
    expect(clip?.parts).toEqual([
      { startMs: 0, endMs: 29_600 },
      { startMs: 40_000, endMs: 69_600 },
    ])
  })

  it("is an ordinary clip when the parts continue each other", () => {
    const [clip] = postprocessCandidates(
      [
        joined([
          { startMs: 10_000, endMs: 20_000 },
          { startMs: 20_000, endMs: 39_600 },
        ]),
      ],
      context
    )
    expect(clip).toMatchObject({ startMs: 10_000, endMs: 39_600 })
    expect(clip?.parts).toBeUndefined()
  })

  it("drops a joined clip that is too short to save", () => {
    expect(
      postprocessCandidates(
        [
          joined([
            { startMs: 100_000, endMs: 104_600 },
            { startMs: 110_000, endMs: 119_600 },
          ]),
        ],
        { ...context, limits: { ...limits, minMs: 30_000 } }
      )
    ).toEqual([])
  })

  it("compares overlap part by part, so a wide compilation doesn't block what lies between", () => {
    const clips = postprocessCandidates(
      [
        joined(
          [
            { startMs: 0, endMs: 9_600 },
            { startMs: 100_000, endMs: 109_600 },
          ],
          0.9
        ),
        raw(40_000, 59_600, 0.8),
        raw(0, 19_600, 0.7),
      ],
      context
    )
    expect(clips.map((c) => c.score)).toEqual([0.9, 0.8])
  })

  it("keeps beats that fall inside a part", () => {
    const [clip] = postprocessCandidates(
      [
        {
          ...joined([
            { startMs: 0, endMs: 9_600 },
            { startMs: 50_000, endMs: 59_600 },
          ]),
          beats: [
            { ms: 52_000, kind: "weird" },
            { ms: 30_000, kind: "weird" },
          ],
        },
      ],
      context
    )
    expect(clip?.beats).toEqual([{ ms: 52_000, kind: "weird" }])
  })
})
