import { describe, expect, it } from "vitest"

import { buildSegments, normalizeWords } from "../transcription/normalize"
import { NICHE_PROFILES } from "./niches"
import {
  applyReviews,
  buildReviewContent,
  REVIEW_LEAD_MS,
  reviewFrameTimes,
  reviewPoolSize,
  reviewResponseSchema,
  UNREVIEWED_PENALTY,
} from "./review"
import type { Candidate } from "./types"

const candidate = (startMs: number, endMs: number, score = 0.6): Candidate => ({
  startMs,
  endMs,
  title: "First pass",
  hook: "first hook",
  reason: "loud",
  score,
})

const words = normalizeWords([
  { text: " Que", startMs: 20_000, endMs: 20_300, confidence: 0.9 },
  { text: " isso?!", startMs: 20_400, endMs: 20_900, confidence: 0.9 },
])

describe("visual review", () => {
  it("over-fetches candidates for the review, within a cap", () => {
    expect(reviewPoolSize(12)).toBe(36)
    expect(reviewPoolSize(30)).toBe(40)
    expect(reviewPoolSize(1)).toBe(3)
  })

  it("samples frames from a lead-in before the start to the end", () => {
    const times = reviewFrameTimes(candidate(10_000, 32_000), 60_000, 12)
    expect(times).toHaveLength(12)
    expect(times[0]).toBe(10_000 - REVIEW_LEAD_MS)
    expect(times.at(-1)).toBe(31_999)
    expect(reviewFrameTimes(candidate(1000, 20_000), 60_000, 4)[0]).toBe(0)
  })

  it("labels every frame with its time and includes the transcript and niche", () => {
    const blocks = buildReviewContent(
      [
        {
          candidate: candidate(20_000, 40_000),
          times: [17_000, 30_000],
          frames: ["AAA", "BBB"],
        },
      ],
      6,
      {
        words,
        segments: buildSegments(words),
        language: "pt",
        limits: { minMs: 15_000, maxMs: 60_000, maxCount: 3 },
        niche: NICHE_PROFILES.gta,
      }
    )
    const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : []))
    expect(text[0]).toContain("The game is GTA.")
    expect(text[0]).toContain("Write titles and hooks in Portuguese.")
    expect(text[1]).toContain("Candidate id 6: 20000–40000 ms")
    expect(text[1]).toContain("[20.0–20.9] Que isso?!")
    expect(blocks.slice(2)).toEqual([
      { type: "text", text: "17000 ms" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "AAA" },
      },
      { type: "text", text: "30000 ms" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "BBB" },
      },
    ])
  })

  it("takes the reviewer's score, payoff start and copy", () => {
    const [moved, kept, unreviewed] = applyReviews(
      [
        candidate(20_000, 40_000),
        candidate(60_000, 80_000),
        candidate(90_000, 110_000),
      ],
      [
        {
          id: 0,
          startMs: 25_500,
          endMs: 41_000,
          title: "Carro voou",
          hook: "Olha o que o carro fez",
          reason: "Car launches off a curb",
          score: 0.95,
        },
        {
          id: 1,
          startMs: 5000,
          endMs: 200_000,
          title: " ",
          hook: "",
          reason: "Menu screen",
          score: 0.1,
        },
      ]
    )
    expect(moved).toMatchObject({
      startMs: 25_500,
      endMs: 41_000,
      title: "Carro voou",
      score: 0.95,
    })
    expect(kept).toMatchObject({
      startMs: 60_000,
      endMs: 80_000,
      title: "First pass",
      hook: "first hook",
      reason: "Menu screen",
      score: 0.1,
    })
    expect(unreviewed!.score).toBeCloseTo(0.6 * UNREVIEWED_PENALTY)
  })

  it("leaves out the niche and names no language when it's auto", () => {
    const [intro] = buildReviewContent([], 0, {
      words: [],
      segments: [],
      language: "auto",
      limits: { minMs: 15_000, maxMs: 60_000, maxCount: 3 },
    })
    expect(intro).toEqual({
      type: "text",
      text: expect.stringContaining(
        "Write titles and hooks in the language the streamer speaks."
      ),
    })
    expect(JSON.stringify(intro)).not.toContain("The game is")
  })

  it("keeps the original range when the reviewer's is empty", () => {
    const [clip] = applyReviews(
      [candidate(20_000, 40_000)],
      [
        {
          id: 0,
          startMs: 30_000,
          endMs: 30_000,
          title: "",
          hook: "",
          reason: "",
          score: 0.7,
        },
      ]
    )
    expect(clip).toMatchObject({
      startMs: 20_000,
      endMs: 40_000,
      reason: "loud",
      score: 0.7,
    })
    expect(reviewFrameTimes(candidate(0, 0), 60_000)).toEqual([0])
  })

  it("keeps beats inside the reviewed range and drops the rest", () => {
    const [clip] = applyReviews(
      [candidate(20_000, 40_000)],
      [
        {
          id: 0,
          startMs: 25_000,
          endMs: 40_000,
          title: "t",
          hook: "h",
          reason: "r",
          score: 0.9,
          beats: [
            { ms: 22_000, kind: "reaction" },
            { ms: 30_000, kind: "weird", x: 0.4, y: 0.6 },
            { ms: 41_000, kind: "reaction" },
          ],
        },
      ]
    )
    expect(clip!.beats).toEqual([{ ms: 30_000, kind: "weird", x: 0.4, y: 0.6 }])
  })

  it("accepts candidates without beats", () => {
    const parsed = reviewResponseSchema.parse({
      clips: [
        {
          id: 0,
          startMs: 1,
          endMs: 2,
          title: "t",
          hook: "h",
          reason: "r",
          score: 0.5,
        },
      ],
    })
    expect(parsed.clips[0]!.beats).toBeUndefined()
  })
})
