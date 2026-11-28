import "server-only"

import { getEnv } from "@/lib/env"

import { FakeTranscriber } from "./fake"
import { GroqTranscriber } from "./groq"
import type { Transcriber } from "./transcriber"

export function getTranscriber(apiKey: string | undefined): Transcriber | null {
  if (getEnv().TRANSCRIBER === "fake") return new FakeTranscriber()
  return apiKey ? new GroqTranscriber(apiKey) : null
}
