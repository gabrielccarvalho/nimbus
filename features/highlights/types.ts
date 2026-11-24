import { z } from "zod"

import type { AudiencePoint, SignalsData, TimeRange } from "../analysis/schema"
import { beatSchema } from "../effects/schema"
import type { Segment, Word } from "../transcription/schema"
import type { NicheProfile } from "./niches"

export const rawCandidateSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
  title: z.string(),
  hook: z.string(),
  reason: z.string(),
  score: z.number(),
  beats: z.array(beatSchema).optional(),
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
  language: string
  reactionPhrases: readonly string[]
  audience?: readonly AudiencePoint[]
  exclude?: readonly TimeRange[]
  niche?: NicheProfile
  frames?: FrameSource
  apiKey?: string
  onPart?: (
    candidates: RawCandidate[],
    parts: { done: number; total: number }
  ) => void
  onReview?: (progress: { done: number; total: number }) => void
  signal?: AbortSignal
}

export type FrameSource = (
  atMs: readonly number[],
  signal?: AbortSignal
) => Promise<string[]>

export interface HighlightSelector {
  readonly id: "anthropic" | "heuristic"
  select(input: SelectorInput): Promise<RawCandidate[]>
}

export interface ClipReviewer {
  review(
    candidates: readonly Candidate[],
    input: SelectorInput
  ): Promise<RawCandidate[]>
}
