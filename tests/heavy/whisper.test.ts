import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { normalizeWords } from "@/features/transcription/normalize"
import { WhisperCppTranscriber } from "@/features/transcription/whisper-cpp"

import { fixtures } from "../../scripts/make-fixtures"

const binary = process.env.WHISPER_BIN ?? "whisper-cli"
const model = process.env.WHISPER_MODEL ?? "./models/ggml-base.en.bin"

function available() {
  try {
    execFileSync(binary, ["--help"], { stdio: "ignore" })
    return existsSync(model)
  } catch {
    return false
  }
}

describe.skipIf(!available())("whisper.cpp (real)", () => {
  it("transcribes the fixture audio with word timestamps", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "whisper-heavy-"))
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
      const result = await new WhisperCppTranscriber({
        binary,
        model,
        threads: 4,
      }).transcribe({ audioPath, durationMs: 20_000, language: "en" })
      const words = normalizeWords(result.tokens)
      for (const word of words) {
        expect(word.endMs).toBeGreaterThanOrEqual(word.startMs)
        expect(word.endMs).toBeLessThanOrEqual(21_000)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
