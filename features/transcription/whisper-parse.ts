import { z } from "zod"

import { AppError } from "@/lib/errors"

import type { RawToken } from "./normalize"

const offsetsSchema = z.object({ from: z.number(), to: z.number() })

const whisperSchema = z.object({
  result: z.object({ language: z.string().optional() }).optional(),
  transcription: z.array(
    z.object({
      offsets: offsetsSchema,
      text: z.string(),
      tokens: z
        .array(
          z.object({
            text: z.string(),
            offsets: offsetsSchema,
            p: z.number().optional(),
          })
        )
        .optional(),
    })
  ),
})

const SPECIAL_TOKEN =
  /^\s*(\[_[A-Z_0-9]+\]|<\|[^|]*\|>|\[(BLANK_AUDIO|MUSIC|NOISE)\])\s*$/

export type WhisperOutput = { language: string; tokens: RawToken[] }

export function parseWhisperJson(json: string): WhisperOutput {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (cause) {
    throw new AppError("EXTERNAL", "whisper.cpp wrote invalid JSON", { cause })
  }
  const parsed = whisperSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError("EXTERNAL", "Unexpected whisper.cpp output format")
  }
  const tokens: RawToken[] = []
  for (const segment of parsed.data.transcription) {
    const source = segment.tokens?.length
      ? segment.tokens
      : [{ text: segment.text, offsets: segment.offsets, p: undefined }]
    for (const token of source) {
      if (!token.text.trim() || SPECIAL_TOKEN.test(token.text)) continue
      tokens.push({
        text: token.text,
        startMs: token.offsets.from,
        endMs: token.offsets.to,
        confidence: token.p,
      })
    }
  }
  return { language: parsed.data.result?.language ?? "unknown", tokens }
}

export function parseWhisperProgress(line: string): number | null {
  const match = /progress\s*=\s*(\d+(?:\.\d+)?)%/.exec(line)
  return match ? Number(match[1]) : null
}
