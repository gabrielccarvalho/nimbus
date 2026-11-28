import "server-only"

import { openAsBlob } from "node:fs"
import { rm } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"

import { runFfmpeg } from "../render/ffmpeg-runner"
import { chunkTokens, planChunks, punctuate } from "./chunks"
import { whisperLanguageCode } from "./language"
import type { RawToken } from "./normalize"
import type {
  DetectLanguageInput,
  RawTranscript,
  TranscribeInput,
  Transcriber,
} from "./transcriber"

export const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions"
export const GROQ_MODEL = "whisper-large-v3-turbo"

type Verbose = {
  language?: string
  words?: { word: string; start: number; end: number }[]
  segments?: { text: string }[]
}

async function failure(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string }
  }
  const message = body.error?.message ?? `Groq returned ${response.status}`
  const details = { status: response.status, transcriber: "groq" }
  if (response.status === 401 || response.status === 403) {
    return new AppError(
      "UNAUTHORIZED",
      "Groq rejected the transcription key. Check it in Workspace settings.",
      { details }
    )
  }
  if (response.status === 413) {
    return new AppError("TOO_LARGE", message, { details })
  }
  if (response.status === 429 || response.status >= 500) {
    return new AppError("EXTERNAL", message, { details })
  }
  return new AppError("VALIDATION", message, { details })
}

export class GroqTranscriber implements Transcriber {
  readonly id = "groq"

  constructor(
    private readonly apiKey: string,
    private readonly url = GROQ_TRANSCRIPTIONS_URL
  ) {}

  private async request(
    file: string,
    {
      language,
      words,
      signal,
    }: { language?: string; words: boolean; signal?: AbortSignal }
  ): Promise<Verbose> {
    const form = new FormData()
    form.set("file", await openAsBlob(file), path.basename(file))
    form.set("model", GROQ_MODEL)
    form.set("response_format", "verbose_json")
    form.set("temperature", "0")
    if (language && language !== "auto") form.set("language", language)
    if (words) {
      form.append("timestamp_granularities[]", "word")
      form.append("timestamp_granularities[]", "segment")
    }
    let response: Response
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal,
      })
    } catch (cause) {
      if (signal?.aborted) {
        throw new AppError("CANCELLED", "Transcription was cancelled")
      }
      throw new AppError("EXTERNAL", "Could not reach Groq", {
        cause,
        details: { transcriber: "groq" },
      })
    }
    if (!response.ok) throw await failure(response)
    return (await response.json()) as Verbose
  }

  async detectLanguage({ samplePath, signal }: DetectLanguageInput) {
    const result = await this.request(samplePath, { words: false, signal })
    const language = whisperLanguageCode(result.language)
    return language ? { language, probability: 1 } : null
  }

  async transcribe({
    audioPath,
    durationMs,
    language = "auto",
    signal,
    onProgress,
    onWord,
    onChunk,
  }: TranscribeInput): Promise<RawTranscript> {
    const chunks = planChunks(durationMs)
    const tokens: RawToken[] = []
    let spoken = language === "auto" ? undefined : language
    for (const [index, chunk] of chunks.entries()) {
      if (signal?.aborted) {
        throw new AppError("CANCELLED", "Transcription was cancelled")
      }
      const piece = path.join(
        path.dirname(audioPath),
        `transcribe-${index}.flac`
      )
      try {
        await runFfmpeg(
          [
            "-ss",
            String(chunk.startMs / 1000),
            ...(index < chunks.length - 1
              ? ["-t", String(chunk.durationMs / 1000)]
              : []),
            "-i",
            audioPath,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "flac",
            piece,
          ],
          { signal }
        )
        const result = await this.request(piece, {
          language: spoken,
          words: true,
          signal,
        })
        spoken ??= whisperLanguageCode(result.language) ?? undefined
        const timed = (result.words ?? []).map((word) => ({
          text: word.word,
          startMs: Math.round(word.start * 1000),
          endMs: Math.round(word.end * 1000),
        }))
        const kept = chunkTokens(
          chunk,
          punctuate(
            timed,
            (result.segments ?? []).map((segment) => segment.text)
          )
        )
        for (const token of kept) {
          tokens.push(token)
          onWord?.({ text: token.text.trim(), startMs: token.startMs })
        }
        await onChunk?.({ tokens: kept, language: spoken ?? "unknown" })
      } finally {
        await rm(piece, { force: true })
      }
      onProgress?.(((index + 1) / chunks.length) * 100)
    }
    return { language: spoken ?? "unknown", tokens }
  }
}
