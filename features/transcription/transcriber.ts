import { isAppError, isRetryable } from "@/lib/errors"

import type { LanguageVote } from "./language"
import type { RawToken } from "./normalize"
import type { SkipReason } from "./schema"

export type TranscribeInput = {
  audioPath: string
  durationMs: number
  language?: string
  fromMs?: number
  signal?: AbortSignal
  onProgress?: (percent: number) => void
  onWord?: (word: LiveWord) => void
  onChunk?: (chunk: TranscribedChunk) => Promise<void> | void
}

export type TranscribedChunk = RawTranscript & { untilMs: number | null }

export type LiveWord = { text: string; startMs: number }

export type RawTranscript = {
  language: string
  tokens: RawToken[]
}

export type DetectLanguageInput = {
  samplePath: string
  signal?: AbortSignal
}

export interface Transcriber {
  readonly id: "groq" | "fake"
  transcribe(input: TranscribeInput): Promise<RawTranscript>
  detectLanguage(input: DetectLanguageInput): Promise<LanguageVote | null>
}

export function skipReason(
  error: unknown,
  { lastAttempt }: { lastAttempt: boolean }
): SkipReason | null {
  if (!isAppError(error) || !error.details?.transcriber) return null
  if (error.code === "UNAUTHORIZED") return "rejected"
  if (error.details.status === 429) return "rate_limited"
  return lastAttempt || !isRetryable(error) ? "api_error" : null
}
