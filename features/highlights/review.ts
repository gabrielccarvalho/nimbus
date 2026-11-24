import { z } from "zod"

import type { TimeRange } from "../analysis/schema"
import { beatSchema, type Beat } from "../effects/schema"
import { languageName, transcriptLines } from "./prompt"
import {
  rawCandidateSchema,
  type Candidate,
  type RawCandidate,
  type SelectorInput,
} from "./types"

export const REVIEW_FRAME_COUNT = 12
export const REVIEW_BATCH_SIZE = 6
export const REVIEW_POOL_FACTOR = 3
export const REVIEW_POOL_MAX = 40
export const REVIEW_LEAD_MS = 3000
export const REVIEW_MAX_SHIFT_MS = 5000
export const UNREVIEWED_PENALTY = 0.5

const seconds = (ms: number) => (ms / 1000).toFixed(1)

export const REVIEW_SYSTEM_PROMPT = `You are the final editor for short-form gameplay clips (TikTok, Shorts, Reels). Each candidate comes with frames sampled across it, labelled with their time, and what was said. You can now see what the transcript couldn't: what actually happens on screen.

Judge each candidate by one question: would a stranger scrolling past stop and watch to the end?

Score high (0.8–1) only when the frames show something visually striking: a bug or glitch (things flying, clipping, T-poses, broken physics), a huge crash or explosion, a chaotic fight or chase, a spectacular fail or death, a jump scare, together with the streamer clearly reacting.
Score middle (0.4–0.7) for a solid action moment or a big reaction to something that is only partly visible.
Score low (under 0.3) when the frames show menus, maps, loading screens, cutscenes, calm driving or walking, or nothing that matches the excitement in the transcript.

Then tighten the clip for retention:
- startMs: the frame where the payoff begins, or at most 1.5 s before it. The first second has to show something happening. Use the frame times; you may move the start earlier than the candidate (frames include a few seconds of lead-in) or later.
- endMs: right after the reaction lands. Keep the length within the limits you are given.
- title and hook: say what is visible, concretely ("car launches into orbit off a curb"), in the language you are told. The hook is on-screen text for the first seconds, under 90 characters, and must make people want to see what happens.
- reason: one sentence an editor can check: what the frames show and how the streamer reacts.
- beats: up to 4 moments, each { ms, kind }. "reaction" where the streamer's face in the webcam visibly reacts (shock, laughter, screaming); "weird" where something strange or impactful happens in the game, with x and y (0–1 of the full frame) for where on screen. Use frame times.

Return every candidate you were given, by id, even the bad ones, with an honest score.`

const lenientBeatSchema = z.object({
  ms: z.number(),
  kind: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
})

type LenientBeat = z.infer<typeof lenientBeatSchema>

export const reviewResponseSchema = z.object({
  clips: z.array(
    rawCandidateSchema.omit({ beats: true }).extend({
      id: z.number().int(),
      beats: z
        .array(lenientBeatSchema.nullable().catch(null))
        .optional()
        .catch(undefined),
    })
  ),
})
export type ReviewedCandidate = z.infer<
  typeof reviewResponseSchema
>["clips"][number]

export type ReviewBlock =
  | { type: "text"; text: string }
  | {
      type: "image"
      source: { type: "base64"; media_type: "image/jpeg"; data: string }
    }

export function reviewPoolSize(maxCount: number) {
  return Math.min(
    REVIEW_POOL_MAX,
    Math.max(maxCount, maxCount * REVIEW_POOL_FACTOR)
  )
}

export function reviewFrameTimes(
  { startMs, endMs }: Pick<Candidate, "startMs" | "endMs">,
  durationMs: number,
  count = REVIEW_FRAME_COUNT
) {
  const from = Math.max(0, startMs - REVIEW_LEAD_MS)
  const to = Math.min(durationMs, endMs)
  if (count <= 1 || to <= from) return [from]
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, i) =>
    Math.min(to - 1, Math.round(from + i * step))
  )
}

export function buildReviewContent(
  batch: readonly {
    candidate: Candidate
    times: readonly number[]
    frames: readonly string[]
  }[],
  firstId: number,
  input: Pick<
    SelectorInput,
    "words" | "segments" | "language" | "limits" | "niche"
  >
): ReviewBlock[] {
  const language =
    input.language && input.language !== "auto"
      ? languageName(input.language)
      : "the language the streamer speaks"
  const blocks: ReviewBlock[] = [
    {
      type: "text",
      text: `${input.niche ? `The game is ${input.niche.label}. What hooks viewers in this niche:\n${input.niche.lookFor.map((item) => `- ${item}`).join("\n")}\n\n` : ""}Each clip must stay between ${seconds(input.limits.minMs)} and ${seconds(input.limits.maxMs)} seconds long. Times are in milliseconds from the start of the recording. Write titles and hooks in ${language}. Lines marked (game) or (unclear) are game audio, not the streamer.`,
    },
  ]
  batch.forEach(({ candidate, times, frames }, index) => {
    blocks.push({
      type: "text",
      text: `Candidate id ${firstId + index}: ${candidate.startMs}–${candidate.endMs} ms. First pass said: "${candidate.title}" — ${candidate.reason}\nTranscript:\n${transcriptLines(input, times[0] ?? candidate.startMs, candidate.endMs)}\nFrames:`,
    })
    frames.forEach((data, i) => {
      blocks.push({ type: "text", text: `${times[i]} ms` })
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      })
    })
  })
  return blocks
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function normalizeBeats(
  raw: readonly (LenientBeat | null)[] | undefined,
  range: TimeRange
) {
  const beats: Beat[] = []
  for (const item of raw ?? []) {
    if (!item) continue
    const { ms, kind, x, y } = item
    const beat = beatSchema.safeParse({
      ms: Math.round(ms),
      kind,
      ...(x === undefined ? {} : { x: clamp01(x) }),
      ...(y === undefined ? {} : { y: clamp01(y) }),
    })
    if (
      beat.success &&
      beat.data.ms >= range.startMs &&
      beat.data.ms <= range.endMs
    )
      beats.push(beat.data)
  }
  return beats
}

export function applyReviews(
  candidates: readonly Candidate[],
  reviews: readonly ReviewedCandidate[]
): RawCandidate[] {
  const byId = new Map(reviews.map((r) => [r.id, r]))
  return candidates.map((candidate, id) => {
    const review = byId.get(id)
    if (!review) {
      return { ...candidate, score: candidate.score * UNREVIEWED_PENALTY }
    }
    const within = (ms: number) =>
      Number.isFinite(ms) &&
      ms >= candidate.startMs - REVIEW_LEAD_MS - REVIEW_MAX_SHIFT_MS &&
      ms <= candidate.endMs + REVIEW_MAX_SHIFT_MS
    const moved =
      within(review.startMs) &&
      within(review.endMs) &&
      review.endMs > review.startMs
    const startMs = moved ? review.startMs : candidate.startMs
    const endMs = moved ? review.endMs : candidate.endMs
    return {
      startMs,
      endMs,
      title: review.title.trim() || candidate.title,
      hook: review.hook.trim() || candidate.hook,
      ...(candidate.description === undefined
        ? {}
        : { description: candidate.description }),
      reason: review.reason.trim() || candidate.reason,
      score: review.score,
      ...(review.beats
        ? { beats: normalizeBeats(review.beats, { startMs, endMs }) }
        : {}),
    }
  })
}
