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

export const transcriptSchema = z.object({
  language: z.string(),
  words: z.array(wordSchema),
  segments: z.array(segmentSchema),
})
export type TranscriptData = z.infer<typeof transcriptSchema>
