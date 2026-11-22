import "server-only"

import { getEnv } from "@/lib/env"

import { FakeTranscriber } from "./fake"
import type { Transcriber } from "./transcriber"
import { WhisperCppTranscriber } from "./whisper-cpp"

export function getTranscriber(): Transcriber {
  const env = getEnv()
  if (env.TRANSCRIBER === "fake") return new FakeTranscriber()
  return new WhisperCppTranscriber({
    binary: env.WHISPER_BIN,
    model: env.WHISPER_MODEL,
    threads: env.WHISPER_THREADS,
  })
}
