import { z } from "zod"

export const wordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
})
export type Word = z.infer<typeof wordSchema>

export const segmentSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  firstWord: z.number().int().nonnegative(),
  lastWord: z.number().int().nonnegative(),
})
export type Segment = z.infer<typeof segmentSchema>

export const languageSourceSchema = z.enum([
  "setting",
  "source",
  "detected",
  "whisper",
])
export type LanguageSource = z.infer<typeof languageSourceSchema>

export const skipReasonSchema = z.enum([
  "no_key",
  "rate_limited",
  "rejected",
  "api_error",
])
export type SkipReason = z.infer<typeof skipReasonSchema>

export const transcriptProgressSchema = z.object({
  untilMs: z.number().int().nonnegative(),
  audioTrack: z.number().int().nonnegative().nullable(),
})
export type TranscriptProgress = z.infer<typeof transcriptProgressSchema>

export const transcriptSchema = z.object({
  language: z.string(),
  languageSource: languageSourceSchema.nullable().optional(),
  words: z.array(wordSchema),
  segments: z.array(segmentSchema),
  partial: transcriptProgressSchema.nullable().optional(),
})
export type TranscriptData = z.infer<typeof transcriptSchema>
