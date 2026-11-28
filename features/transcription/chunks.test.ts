import { describe, expect, it } from "vitest"

import { chunkTokens, planChunks, punctuate } from "./chunks"

describe("planChunks", () => {
  it("sends a short recording in one piece", () => {
    expect(planChunks(90_000)).toEqual([
      {
        startMs: 0,
        durationMs: 90_000,
        keepFromMs: 0,
        keepToMs: Number.POSITIVE_INFINITY,
      },
    ])
  })

  it("overlaps neighbours and keeps each word once", () => {
    const chunks = planChunks(25_000, 10_000, 1_000)
    expect(chunks).toEqual([
      { startMs: 0, durationMs: 11_000, keepFromMs: 0, keepToMs: 10_000 },
      {
        startMs: 9_000,
        durationMs: 12_000,
        keepFromMs: 10_000,
        keepToMs: 20_000,
      },
      {
        startMs: 19_000,
        durationMs: 6_000,
        keepFromMs: 20_000,
        keepToMs: Number.POSITIVE_INFINITY,
      },
    ])
  })

  it("still plans one chunk for unknown durations", () => {
    expect(planChunks(0)).toHaveLength(1)
  })
})

describe("chunkTokens", () => {
  const [first, second] = planChunks(20_000, 10_000, 1_000)

  it("moves tokens to recording time and drops the overlap", () => {
    const tokens = [
      { text: " a", startMs: 500, endMs: 900 },
      { text: " b", startMs: 1_200, endMs: 1_500 },
    ]
    expect(chunkTokens(second!, tokens)).toEqual([
      { text: " b", startMs: 10_200, endMs: 10_500 },
    ])
    expect(
      chunkTokens(first!, [{ text: " c", startMs: 10_400, endMs: 10_800 }])
    ).toEqual([])
  })
})

describe("punctuate", () => {
  const words = [
    { text: "ola", startMs: 0, endMs: 200 },
    { text: "pessoal", startMs: 200, endMs: 500 },
    { text: "bora", startMs: 900, endMs: 1100 },
    { text: "jogar", startMs: 1100, endMs: 1400 },
  ]

  it("takes punctuation and case from the segment text", () => {
    expect(
      punctuate(words, ["Olá, pessoal!", "Bora jogar?"]).map((t) => t.text)
    ).toEqual([" ola", " pessoal!", " Bora", " jogar?"])
  })

  it("keeps the timed word when the texts drift apart", () => {
    expect(
      punctuate(words, ["Fala galera, bora jogar."]).map((t) => t.text)
    ).toEqual([" ola", " pessoal", " bora", " jogar."])
  })
})
