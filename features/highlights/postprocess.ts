import type { TimeRange } from "../analysis/schema"
import type { Segment, Word } from "../transcription/schema"
import { coveredShare, gameDialogueStretches } from "./game-dialogue"
import type { Candidate, RawCandidate, SelectionLimits } from "./types"

export const SNAP_WINDOW_MS = 1500
export const MAX_OVERLAP_RATIO = 0.2
export const GAME_DIALOGUE_PENALTY = 0.6

type Context = {
  durationMs: number
  words: readonly Word[]
  segments: readonly Segment[]
  limits: SelectionLimits
  language?: string
  exclude?: readonly TimeRange[]
}

function nearest(values: readonly number[], target: number, within = Infinity) {
  let best: number | undefined
  for (const value of values) {
    const distance = Math.abs(value - target)
    if (distance > within) continue
    if (best === undefined || distance < Math.abs(best - target)) best = value
  }
  return best
}

function snap(
  ms: number,
  sentence: readonly number[],
  word: readonly number[]
) {
  return nearest(sentence, ms, SNAP_WINDOW_MS) ?? nearest(word, ms) ?? ms
}

function fitLength(
  startMs: number,
  endMs: number,
  { durationMs, words, limits }: Context
): [number, number] {
  const length = endMs - startMs
  if (length > limits.maxMs) {
    const limit = startMs + limits.maxMs
    const ends = words
      .map((w) => w.endMs)
      .filter((e) => e > startMs + limits.minMs && e <= limit)
    return [startMs, ends.length ? Math.max(...ends) : limit]
  }
  if (length < limits.minMs) {
    const needed = startMs + limits.minMs
    const after = words
      .map((w) => w.endMs)
      .filter((e) => e >= needed && e <= startMs + limits.maxMs)
    if (after.length) return [startMs, Math.min(...after)]
    if (needed <= durationMs) return [startMs, needed]
    const shiftedStart = Math.max(0, durationMs - limits.minMs)
    const starts = words.map((w) => w.startMs).filter((s) => s <= shiftedStart)
    return [starts.length ? Math.max(...starts) : shiftedStart, durationMs]
  }
  return [startMs, endMs]
}

function overlapRatio(a: TimeRange, b: TimeRange) {
  const overlap = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)
  if (overlap <= 0) return 0
  return overlap / Math.min(a.endMs - a.startMs, b.endMs - b.startMs)
}

export function postprocessCandidates(
  raw: readonly RawCandidate[],
  context: Context
): Candidate[] {
  const { durationMs, words, segments, limits } = context
  const sentenceStarts = segments.map((s) => s.startMs)
  const sentenceEnds = segments.map((s) => s.endMs)
  const wordStarts = words.map((w) => w.startMs)
  const wordEnds = words.map((w) => w.endMs)
  const gameDialogue = context.language
    ? gameDialogueStretches(words, context.language)
    : []

  const shaped: Candidate[] = []
  for (const candidate of raw) {
    if (
      !Number.isFinite(candidate.startMs) ||
      !Number.isFinite(candidate.endMs)
    )
      continue
    let startMs = Math.max(
      0,
      Math.min(durationMs, Math.round(candidate.startMs))
    )
    let endMs = Math.max(0, Math.min(durationMs, Math.round(candidate.endMs)))
    if (endMs <= startMs) continue
    startMs = snap(startMs, sentenceStarts, wordStarts)
    endMs = snap(endMs, sentenceEnds, wordEnds)
    if (endMs <= startMs) continue
    ;[startMs, endMs] = fitLength(startMs, endMs, context)
    const length = endMs - startMs
    if (length < limits.minMs || length > limits.maxMs || endMs > durationMs)
      continue
    const score = Number.isFinite(candidate.score)
      ? Math.min(1, Math.max(0, candidate.score))
      : 0
    const penalty =
      GAME_DIALOGUE_PENALTY * coveredShare({ startMs, endMs }, gameDialogue)
    shaped.push({
      ...candidate,
      startMs,
      endMs,
      title: candidate.title.trim().slice(0, 100) || "Untitled clip",
      hook: candidate.hook.trim().slice(0, 200),
      reason: candidate.reason.trim().slice(0, 500),
      score: score * (1 - penalty),
    })
  }

  const exclude = context.exclude ?? []
  const accepted: Candidate[] = []
  for (const candidate of [...shaped].sort((a, b) => b.score - a.score)) {
    if (
      [...exclude, ...accepted].every(
        (other) => overlapRatio(candidate, other) <= MAX_OVERLAP_RATIO
      )
    ) {
      accepted.push(candidate)
    }
    if (accepted.length === limits.maxCount) break
  }
  return accepted
}
