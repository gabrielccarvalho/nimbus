import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords } from "../transcription/normalize"
import { scoreWindows } from "./heuristic"

const MINUTE = 60_000
const limits = { minMs: 15_000, maxMs: 30_000, maxCount: 3 }

function stream({
  durationMs = 10 * MINUTE,
  moment,
  momentAt = 5 * MINUTE,
  confidence = 0.9,
  momentConfidence = confidence,
  loudness = () => -30,
  language = "pt",
  reactionPhrases = [] as string[],
  audience,
}: {
  durationMs?: number
  moment: string[]
  momentAt?: number
  confidence?: number
  momentConfidence?: number
  loudness?: (ms: number) => number
  language?: string
  reactionPhrases?: string[]
  audience?: { startMs: number; endMs: number; value: number }[]
}) {
  const tokens = []
  for (let ms = 0; ms < durationMs; ms += 1500) {
    if (ms >= momentAt && ms < momentAt + 20_000) continue
    tokens.push({ text: " então", startMs: ms, endMs: ms + 400, confidence })
  }
  moment.forEach((text, i) =>
    tokens.push({
      text: ` ${text}`,
      startMs: momentAt + i * 700,
      endMs: momentAt + i * 700 + 500,
      confidence: momentConfidence,
    })
  )
  tokens.sort((a, b) => a.startMs - b.startMs)
  const words = normalizeWords(tokens)
  return scoreWindows({
    durationMs,
    words,
    segments: buildSegments(words),
    signals: {
      silences: [],
      loudness: Array.from({ length: durationMs / 250 }, (_, i) =>
        loudness(i * 250)
      ),
      loudnessIntervalMs: 250,
      speechDensity: [],
    },
    limits,
    language,
    reactionPhrases,
    audience,
  })
}

const best = (candidates: ReturnType<typeof scoreWindows>) =>
  [...candidates].sort((a, b) => b.score - a.score)[0]!

const PT_MOMENT = [
  "meu",
  "deus!",
  "kkkkk",
  "vai",
  "vai",
  "vai",
  "não",
  "acredito!",
]

describe("heuristic scoring", () => {
  it("finds a Portuguese reaction without English keywords", () => {
    const top = best(stream({ moment: PT_MOMENT }))
    expect(top.startMs).toBeGreaterThanOrEqual(5 * MINUTE - limits.maxMs)
    expect(top.startMs).toBeLessThanOrEqual(5 * MINUTE + 5_000)
    expect(top.reason).toMatch(/reaction phrases/)
    expect(top.reason).toMatch(/laughing or shouting/)
    expect(top.reason).toMatch(/repeated words/)
  })

  it("only counts phrases from the spoken language and the catchphrases", () => {
    const moment = ["bora", "bill", "agora"]
    expect(best(stream({ moment, language: "en" })).reason).not.toMatch(
      /reaction phrases/
    )
    expect(
      best(stream({ moment, language: "en", reactionPhrases: ["Bora Bill"] }))
        .reason
    ).toMatch(/reaction phrases/)
  })

  it("scores a spike against its surroundings, not the loudest section", () => {
    const top = best(
      stream({
        moment: ["então"],
        loudness: (ms) =>
          ms < 2 * MINUTE
            ? -12
            : ms >= 6 * MINUTE && ms < 6 * MINUTE + 8000
              ? -14
              : -32,
      })
    )
    expect(top.startMs).toBeGreaterThan(5 * MINUTE)
    expect(top.startMs).toBeLessThanOrEqual(6 * MINUTE + 8000)
  })

  it("ignores a streamer's constant filler words", () => {
    const filler = stream({
      moment: ["então"],
      language: "pt",
      reactionPhrases: ["então"],
    })
    expect(best(filler).reason).not.toMatch(/reaction phrases/)
  })

  it("scores unclear speech lower", () => {
    const clear = best(stream({ moment: PT_MOMENT }))
    const unclear = best(stream({ moment: PT_MOMENT, momentConfidence: 0.2 }))
    expect(unclear.score).toBeLessThan(clear.score)
  })

  it("handles a three-hour stream quickly", () => {
    const started = performance.now()
    const candidates = stream({ durationMs: 180 * MINUTE, moment: PT_MOMENT })
    expect(candidates.length).toBeGreaterThan(1000)
    expect(performance.now() - started).toBeLessThan(5000)
  })
})

describe("YouTube replay heatmap", () => {
  const buckets = (hotAt: number) =>
    Array.from({ length: 100 }, (_, i) => ({
      startMs: i * 6000,
      endMs: (i + 1) * 6000,
      value: Math.abs(i * 6000 - hotAt) < 30_000 ? 1 : 0.1,
    }))
  const steady = (ms: number) => -30 + Math.sin(ms / 7000) * 2

  it("pulls the pick towards the most rewatched part", () => {
    const pick = best(
      stream({
        moment: ["então"],
        loudness: steady,
        audience: buckets(8 * MINUTE),
      })
    )
    expect(pick.startMs).toBeGreaterThan(7 * MINUTE)
    expect(pick.startMs).toBeLessThan(9 * MINUTE)
    expect(pick.reason).toMatch(/rewatched most on YouTube/)
  })

  it("lets a clear reaction beat a mildly rewatched stretch", () => {
    const pick = best(
      stream({
        moment: PT_MOMENT,
        loudness: (ms) =>
          ms >= 5 * MINUTE && ms < 5 * MINUTE + 15_000 ? -12 : -30,
        audience: buckets(8 * MINUTE).map((p) => ({
          ...p,
          value: p.value * 0.3,
        })),
      })
    )
    expect(pick.startMs).toBeGreaterThan(4.5 * MINUTE)
    expect(pick.startMs).toBeLessThan(5.5 * MINUTE)
  })

  it("ignores a flat heatmap", () => {
    const flat = Array.from({ length: 100 }, (_, i) => ({
      startMs: i * 6000,
      endMs: (i + 1) * 6000,
      value: i === 80 ? 0.58 : 0.55,
    }))
    const pick = best(stream({ moment: PT_MOMENT, audience: flat }))
    expect(pick.reason).not.toMatch(/YouTube/)
  })

  it("scores the same as before without a heatmap", () => {
    const without = stream({ moment: PT_MOMENT })
    const empty = stream({ moment: PT_MOMENT, audience: [] })
    expect(empty).toEqual(without)
  })
})
