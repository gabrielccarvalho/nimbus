import type { LanguageVote } from "./language"
import type { RawToken } from "./normalize"

export type TranscribeInput = {
  audioPath: string
  durationMs: number
  language?: string
  signal?: AbortSignal
  onProgress?: (percent: number) => void
  onWord?: (word: LiveWord) => void
}

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
  readonly id: "whisper" | "fake"
  readonly multilingual: boolean
  transcribe(input: TranscribeInput): Promise<RawTranscript>
  detectLanguage(input: DetectLanguageInput): Promise<LanguageVote | null>
}
