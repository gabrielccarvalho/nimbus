import Anthropic from "@anthropic-ai/sdk"
import { http, HttpResponse } from "msw"
import pino from "pino"
import { describe, expect, it } from "vitest"

import { AnthropicSelector } from "@/features/highlights/anthropic"
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
}
const logger = pino({ level: "silent" })
const create = () =>
  new AnthropicSelector(
    new Anthropic({ apiKey: "test-key", baseURL: BASE, maxRetries: 0 }),
    "claude-opus-5-5"
  )

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
      /invalid x-api-key/,
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
})
