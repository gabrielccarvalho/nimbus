import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { GroqTranscriber } from "@/features/transcription/groq"
import { normalizeWords } from "@/features/transcription/normalize"

import { fixtures } from "../../scripts/make-fixtures"

const key = process.env.GROQ_API_KEY

describe.skipIf(!key)("Groq whisper (real)", () => {
  it("transcribes the fixture audio with word timestamps", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "groq-heavy-"))
    try {
      const audioPath = path.join(dir, "audio.wav")
      execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", [
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
      const raw = await new GroqTranscriber(key!).transcribe({
        audioPath,
        durationMs: 20_000,
        language: "en",
      })
      const words = normalizeWords(raw.tokens)
      expect(raw.language).toBe("en")
      expect(words.length).toBeGreaterThan(5)
      for (const word of words) {
        expect(word.endMs).toBeGreaterThanOrEqual(word.startMs)
        expect(word.startMs).toBeLessThan(21_000)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
