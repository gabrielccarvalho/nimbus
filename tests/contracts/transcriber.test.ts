import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { http, HttpResponse } from "msw"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { FakeTranscriber } from "@/features/transcription/fake"
import {
  GROQ_TRANSCRIPTIONS_URL,
  GroqTranscriber,
} from "@/features/transcription/groq"
import type { Transcriber } from "@/features/transcription/transcriber"
import { getEnv } from "@/lib/env"

import { fixtures } from "../../scripts/make-fixtures"
import { server } from "../utils/msw"

let dir: string
let audioPath: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "transcriber-"))
  audioPath = path.join(dir, "audio.wav")
  execFileSync(getEnv().FFMPEG_PATH, [
    "-v",
    "error",
    "-i",
    fixtures.wide,
    "-ac",
    "1",
    "-ar",
    "16000",
    audioPath,
  ])
})
afterAll(() => rm(dir, { recursive: true, force: true }))

function groqReplies() {
  server.use(
    http.post(GROQ_TRANSCRIPTIONS_URL, () =>
      HttpResponse.json({
        language: "english",
        segments: [{ text: " Okay, let's go." }],
        words: [
          { word: "Okay", start: 0.2, end: 0.5 },
          { word: "let's", start: 0.6, end: 0.8 },
          { word: "go", start: 0.8, end: 1.1 },
        ],
      })
    )
  )
}

describe.each<[string, () => Transcriber]>([
  ["fake", () => new FakeTranscriber()],
  ["groq", () => new GroqTranscriber("gsk_contract_0123456789abcdef")],
])("%s transcriber contract", (_, create) => {
  beforeEach(groqReplies)

  it("returns ordered tokens inside the audio with a language and progress", async () => {
    const progress: number[] = []
    const result = await create().transcribe({
      audioPath,
      durationMs: 20_000,
      onProgress: (p) => progress.push(p),
    })
    expect(result.language).toMatch(/^[a-z]{2}$/)
    expect(result.tokens.length).toBeGreaterThan(0)
    for (const token of result.tokens) {
      expect(token.text.trim()).not.toBe("")
      expect(token.startMs).toBeGreaterThanOrEqual(0)
      expect(token.endMs).toBeGreaterThanOrEqual(token.startMs)
      expect(token.endMs).toBeLessThanOrEqual(20_000)
    }
    expect(progress.at(-1)).toBe(100)
  })

  it("stops when aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      create().transcribe({
        audioPath,
        durationMs: 20_000,
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })
})

describe("groq adapter", () => {
  it.each([
    [429, "EXTERNAL"],
    [500, "EXTERNAL"],
    [413, "TOO_LARGE"],
    [400, "VALIDATION"],
    [401, "UNAUTHORIZED"],
  ])("maps a %i to %s", async (status, code) => {
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, () =>
        HttpResponse.json({ error: { message: "nope" } }, { status })
      )
    )
    await expect(
      new GroqTranscriber("gsk_contract_0123456789abcdef").transcribe({
        audioPath,
        durationMs: 20_000,
      })
    ).rejects.toMatchObject({ code })
  })

  it("detects the language from a sample", async () => {
    groqReplies()
    expect(
      await new GroqTranscriber("gsk_contract_0123456789abcdef").detectLanguage(
        { samplePath: audioPath }
      )
    ).toEqual({ language: "en", probability: 1 })
  })
})
