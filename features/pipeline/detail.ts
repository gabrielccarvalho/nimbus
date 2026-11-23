import { z } from "zod"

import { timeRangeSchema } from "../analysis/schema"
import { languageSourceSchema } from "../transcription/schema"

export const stepDetailSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("download"),
    downloadedBytes: z.number(),
    totalBytes: z.number().nullable(),
    bytesPerSecond: z.number().nullable(),
    etaSeconds: z.number().nullable(),
  }),
  z.object({
    kind: z.literal("transcribe"),
    phase: z.enum(["extracting", "detecting", "transcribing"]),
    language: z.string().nullable(),
    languageSource: languageSourceSchema.nullable(),
    text: z.string(),
    words: z.number(),
    audioMs: z.number(),
  }),
  z.object({
    kind: z.literal("analyze"),
    durationMs: z.number(),
    analyzedMs: z.number(),
    waveform: z.array(z.number()),
    silences: z.array(timeRangeSchema),
  }),
  z.object({
    kind: z.literal("select"),
    candidates: z.array(
      z.object({
        startMs: z.number(),
        endMs: z.number(),
        title: z.string(),
        score: z.number(),
      })
    ),
    parts: z.object({ done: z.number(), total: z.number() }).nullable(),
  }),
])
export type StepDetail = z.infer<typeof stepDetailSchema>

export const DETAIL_INTERVAL_MS = 500
export const TRANSCRIPT_TAIL_CHARS = 400
export const WAVEFORM_POINTS = 240
export const MAX_DETAIL_SILENCES = 300
export const MAX_DETAIL_CANDIDATES = 30

export function textTail(text: string, max = TRANSCRIPT_TAIL_CHARS) {
  if (text.length <= max) return text
  return text.slice(text.length - max).replace(/^\S*\s+/, "")
}

export function downsampleMax(values: readonly number[], points: number) {
  if (values.length <= points) return [...values]
  const out: number[] = []
  for (let i = 0; i < points; i++) {
    const from = Math.floor((i * values.length) / points)
    const to = Math.max(
      from + 1,
      Math.floor(((i + 1) * values.length) / points)
    )
    let max = -Infinity
    for (let j = from; j < to; j++) max = Math.max(max, values[j]!)
    out.push(max)
  }
  return out
}

export function estimateRemainingMs(
  elapsedMs: number,
  progress: number
): number | null {
  if (progress < 3 || progress >= 100 || elapsedMs < 2000) return null
  return (elapsedMs * (100 - progress)) / progress
}
