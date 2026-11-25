import Anthropic from "@anthropic-ai/sdk"
import { http, HttpResponse } from "msw"
import pino from "pino"
import { describe, expect, it } from "vitest"

import {
  AnthropicReviewer,
  AnthropicSelector,
} from "@/features/highlights/anthropic"
import { selectHighlights } from "@/features/highlights"
import {
  buildSegments,
  normalizeWords,
} from "@/features/transcription/normalize"

import { server } from "../utils/msw"

const BASE = "http://anthropic.test"
const words = normalizeWords(
  Array.from({ length: 60 }, (_, i) => ({
    text: i % 6 === 5 ? " now!" : " go",
    startMs: i * 1000,
    endMs: i * 1000 + 500,
  }))
)
const input = {
  durationMs: 60_000,
  words,
  segments: buildSegments(words),
  signals: {
    silences: [{ startMs: 30_000, endMs: 31_000 }],
    loudness: Array.from({ length: 240 }, (_, i) => -30 + (i % 20)),
    loudnessIntervalMs: 250,
    speechDensity: [],
  },
  limits: { minMs: 15_000, maxMs: 30_000, maxCount: 3 },
  language: "en",
  reactionPhrases: [],
}
const logger = pino({ level: "silent" })
const create = () =>
  new AnthropicSelector(
    new Anthropic({ apiKey: "test-key", baseURL: BASE, maxRetries: 0 }),
    "claude-opus-5-5"
  )

const client = () =>
  new Anthropic({ apiKey: "test-key", baseURL: BASE, maxRetries: 0 })
const reviewer = () => new AnthropicReviewer(client(), "claude-opus-5-5")
const frames = async (atMs: readonly number[]) => atMs.map(() => "/9j/AA==")

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 10, output_tokens: 10 },
})

const clipsJson = JSON.stringify({
  clips: [
    {
      startMs: 6100,
      endMs: 24_000,
      title: "Go now",
      hook: "Watch this",
      reason: "Peak",
      score: 0.9,
    },
  ],
})

describe("AnthropicSelector", () => {
  it("sends the transcript with structured output and returns parsed clips", async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(message(clipsJson))
      })
    )
    const { candidates, fallbackReason } = await selectHighlights(
      "anthropic",
      input,
      logger,
      create
    )
    expect(fallbackReason).toBeUndefined()
    expect(candidates).toEqual([
      expect.objectContaining({
        startMs: 6000,
        endMs: 23_500,
        title: "Go now",
        score: 0.9,
      }),
    ])
    const body = bodies[0]!
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema" } },
    })
    expect(body).not.toHaveProperty("tool_choice")
    expect(JSON.stringify(body.messages)).toContain(
      "[0.0–5.5] go go go go go now!"
    )
  })

  it("sends the selection rules in every part and the review rules to the reviewer", async () => {
    const texts: string[] = []
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        texts.push(JSON.stringify(await request.json()))
        return HttpResponse.json(message(clipsJson))
      })
    )
    await selectHighlights(
      "anthropic",
      {
        ...input,
        frames,
        playbook: {
          selection: ["Open on the crash"],
          review: ["Cut slow ends"],
        },
      },
      logger,
      create,
      reviewer
    )
    expect(texts[0]).toContain("Open on the crash")
    expect(texts[0]).not.toContain("Cut slow ends")
    expect(texts[1]).toContain("Cut slow ends")
    expect(texts[1]).not.toContain("Open on the crash")
  })

  it("splits very long transcripts into parts", async () => {
    const prompts: string[] = []
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        const body = (await request.json()) as {
          messages: { content: string }[]
        }
        prompts.push(body.messages[0]!.content)
        return HttpResponse.json(message(clipsJson))
      })
    )
    const long = normalizeWords(
      Array.from({ length: 20_000 }, (_, i) => ({
        text: i % 10 === 9 ? " agora." : " palavra",
        startMs: i * 500,
        endMs: i * 500 + 400,
      }))
    )
    await create().select({
      ...input,
      durationMs: 10_000_000,
      words: long,
      segments: buildSegments(long),
      language: "pt",
    })
    expect(prompts.length).toBeGreaterThan(1)
    expect(prompts[0]).toContain(`This is part 1 of ${prompts.length}`)
    expect(prompts[0]).toContain("The streamer speaks Portuguese.")
  })

  it("asks once more when the reply doesn't parse", async () => {
    let calls = 0
    server.use(
      http.post(`${BASE}/v1/messages`, () => {
        calls++
        return HttpResponse.json(message(calls === 1 ? "not json" : clipsJson))
      })
    )
    expect(await create().select(input)).toHaveLength(1)
    expect(calls).toBe(2)
  })

  it.each([
    ["a refusal", () => HttpResponse.json(message("", "refusal")), /declined/],
    [
      "an auth error",
      () =>
        HttpResponse.json(
          {
            type: "error",
            error: {
              type: "authentication_error",
              message: "invalid x-api-key",
            },
          },
          { status: 401 }
        ),
      /API key was rejected/,
    ],
    [
      "a rate limit",
      () =>
        HttpResponse.json(
          {
            type: "error",
            error: { type: "rate_limit_error", message: "slow down" },
          },
          { status: 429 }
        ),
      /rate limited/,
    ],
    [
      "an oversized prompt",
      () =>
        HttpResponse.json(
          {
            type: "error",
            error: {
              type: "invalid_request_error",
              message: "prompt is too long: 1200000 tokens > 1000000 maximum",
            },
          },
          { status: 400 }
        ),
      /transcript is too long/,
    ],
    [
      "two bad replies",
      () => HttpResponse.json(message("nope")),
      /invalid highlight JSON twice/,
    ],
  ])("falls back to the heuristic after %s", async (_, reply, reason) => {
    server.use(http.post(`${BASE}/v1/messages`, reply))
    const { candidates, fallbackReason } = await selectHighlights(
      "anthropic",
      input,
      logger,
      create
    )
    expect(fallbackReason).toMatch(reason)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0]!.reason).toMatch(/^Heuristic/)
  })

  it("propagates cancellation instead of falling back", async () => {
    server.use(
      http.post(`${BASE}/v1/messages`, () =>
        HttpResponse.json(message(clipsJson))
      )
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      selectHighlights(
        "anthropic",
        { ...input, signal: controller.signal },
        logger,
        create
      )
    ).rejects.toThrow()
  })

  it("reviews frames of a wider pool and keeps the payoff start", async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        if (!String(body.system).includes("final editor")) {
          return HttpResponse.json(
            message(
              JSON.stringify({
                clips: [
                  {
                    startMs: 6000,
                    endMs: 24_000,
                    title: "Go",
                    hook: "",
                    reason: "Loud",
                    score: 0.9,
                  },
                  {
                    startMs: 36_000,
                    endMs: 54_000,
                    title: "Now",
                    hook: "",
                    reason: "Loud",
                    score: 0.5,
                  },
                ],
              })
            )
          )
        }
        return HttpResponse.json(
          message(
            JSON.stringify({
              clips: [
                {
                  id: 0,
                  startMs: 6000,
                  endMs: 24_000,
                  title: "Menu",
                  hook: "",
                  reason: "Pause menu",
                  score: 0.1,
                },
                {
                  id: 1,
                  startMs: 39_000,
                  endMs: 56_000,
                  title: "Car flies",
                  hook: "Watch the car",
                  reason: "Car launches",
                  score: 0.95,
                },
              ],
            })
          )
        )
      })
    )
    const progress: number[] = []
    const { candidates, reviewFailure } = await selectHighlights(
      "anthropic",
      { ...input, frames, onReview: ({ done }) => progress.push(done) },
      logger,
      create,
      reviewer
    )
    expect(reviewFailure).toBeUndefined()
    expect(candidates.map((c) => [c.startMs, c.title, c.score])).toEqual([
      [39_000, "Car flies", 0.95],
      [6000, "Menu", 0.1],
    ])
    expect(progress).toEqual([1])
    expect(JSON.stringify(bodies[0]!.messages)).toContain("Pick up to 9 clips")
    const review = bodies[1]!
    expect(review).toMatchObject({ output_config: { effort: "medium" } })
    const content = (review.messages as { content: { type: string }[] }[])[0]!
      .content
    expect(content.filter((b) => b.type === "image")).toHaveLength(24)
  })

  it("keeps the first pass when the review fails", async () => {
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        const body = (await request.json()) as { system: string }
        return body.system.includes("final editor")
          ? HttpResponse.json(
              { type: "error", error: { type: "api_error", message: "boom" } },
              { status: 500 }
            )
          : HttpResponse.json(message(clipsJson))
      })
    )
    const { candidates, reviewFailure } = await selectHighlights(
      "anthropic",
      { ...input, frames },
      logger,
      create,
      reviewer
    )
    expect(reviewFailure).toMatch(/overloaded or unavailable/)
    expect(candidates).toEqual([
      expect.objectContaining({ startMs: 6000, title: "Go now" }),
    ])
  })
})
