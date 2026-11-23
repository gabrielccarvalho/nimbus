import { describe, expect, it } from "vitest"

import { normalizeWords } from "../transcription/normalize"
import { coveredShare, gameDialogueStretches } from "./game-dialogue"

const ENGLISH =
  "you know what I got a place for you to stay so are you having second thoughts".split(
    " "
  )
const PORTUGUESE = "olha lá ele ama ela gente vai que isso não".split(" ")

function speech(lines: { at: number; text: string[]; gap?: number }[]) {
  return normalizeWords(
    lines.flatMap(({ at, text, gap = 400 }) =>
      text.map((word, i) => ({
        text: ` ${word}`,
        startMs: at + i * gap,
        endMs: at + i * gap + 300,
      }))
    )
  )
}

describe("gameDialogueStretches", () => {
  it("finds long runs of dialogue in another language", () => {
    const words = speech([
      { at: 0, text: PORTUGUESE },
      ...Array.from({ length: 6 }, (_, i) => ({
        at: 10_000 + i * 5000,
        text: ENGLISH.slice(0, 10),
      })),
      { at: 45_000, text: PORTUGUESE },
    ])
    expect(gameDialogueStretches(words, "pt")).toEqual([
      { startMs: 10_000, endMs: 40_000 },
    ])
  })

  it("bridges a single quiet bin and drops short runs", () => {
    const words = speech([
      { at: 0, text: ENGLISH.slice(0, 8) },
      { at: 5000, text: ENGLISH.slice(0, 8) },
      { at: 15_000, text: ENGLISH.slice(0, 8) },
      { at: 60_000, text: ENGLISH.slice(0, 8) },
      { at: 65_000, text: ENGLISH.slice(0, 8) },
    ])
    expect(gameDialogueStretches(words, "pt")).toEqual([
      { startMs: 0, endMs: 20_000 },
    ])
  })

  it("leaves the streamer's own language and unknown languages alone", () => {
    const words = speech(
      Array.from({ length: 8 }, (_, i) => ({
        at: i * 5000,
        text: ENGLISH.slice(0, 10),
      }))
    )
    expect(gameDialogueStretches(words, "en")).toEqual([])
    expect(gameDialogueStretches(words, "ja")).toEqual([])
    expect(gameDialogueStretches(words, "pt")).toHaveLength(1)
  })
})

describe("coveredShare", () => {
  it("measures how much of a range the stretches cover", () => {
    const stretches = [
      { startMs: 0, endMs: 10_000 },
      { startMs: 20_000, endMs: 25_000 },
    ]
    expect(coveredShare({ startMs: 5000, endMs: 25_000 }, stretches)).toBe(0.5)
    expect(coveredShare({ startMs: 30_000, endMs: 40_000 }, stretches)).toBe(0)
  })
})
