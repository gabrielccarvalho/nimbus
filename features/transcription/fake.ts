import { AppError } from "@/lib/errors"

import data from "./fake-transcript.json"
import type { RawToken } from "./normalize"
import type { RawTranscript, TranscribeInput, Transcriber } from "./transcriber"

export class FakeTranscriber implements Transcriber {
  readonly id = "fake"

  async transcribe({
    durationMs,
    signal,
    onProgress,
  }: TranscribeInput): Promise<RawTranscript> {
    const tokens: RawToken[] = []
    const loops = Math.max(1, Math.ceil(durationMs / data.durationMs))
    for (let loop = 0; loop < loops; loop++) {
      if (signal?.aborted)
        throw new AppError("CANCELLED", "Transcription was cancelled")
      const offset = loop * data.durationMs
      for (const sentence of data.sentences) {
        if (sentence.startMs + offset >= durationMs) continue
        const words = sentence.text.split(/\s+/)
        const step = (sentence.endMs - sentence.startMs) / words.length
        words.forEach((word, index) => {
          const startMs = Math.round(offset + sentence.startMs + index * step)
          tokens.push({
            text: ` ${word}`,
            startMs,
            endMs: Math.min(durationMs, Math.round(startMs + step * 0.9)),
            confidence: 0.95,
          })
        })
      }
      onProgress?.(((loop + 1) / loops) * 100)
    }
    return { language: data.language, tokens }
  }
}
