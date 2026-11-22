import { z } from "zod"

import type { SignalsData } from "../analysis/schema"
import type { Segment, Word } from "../transcription/schema"

export const rawCandidateSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
  title: z.string(),
  hook: z.string(),
  reason: z.string(),
  score: z.number(),
})
export type RawCandidate = z.infer<typeof rawCandidateSchema>

export const candidatesResponseSchema = z.object({
  clips: z.array(rawCandidateSchema),
})

export type Candidate = RawCandidate

export type SelectionLimits = {
  minMs: number
  maxMs: number
  maxCount: number
}

export type SelectorInput = {
  durationMs: number
  words: readonly Word[]
  segments: readonly Segment[]
  signals: SignalsData
  limits: SelectionLimits
  signal?: AbortSignal
}

export interface HighlightSelector {
  readonly id: "anthropic" | "heuristic"
  select(input: SelectorInput): Promise<RawCandidate[]>
}
