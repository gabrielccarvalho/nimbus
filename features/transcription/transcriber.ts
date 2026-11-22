import type { RawToken } from "./normalize"

export type TranscribeInput = {
  audioPath: string
  durationMs: number
  language?: string
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

export type RawTranscript = {
  language: string
  tokens: RawToken[]
}

export interface Transcriber {
  readonly id: "whisper" | "fake"
  transcribe(input: TranscribeInput): Promise<RawTranscript>
}
