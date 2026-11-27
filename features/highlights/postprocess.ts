import type { TimeRange } from "../analysis/schema"
import {
  CLIP_MAX_PARTS,
  CLIP_PART_MIN_MS,
  clipParts,
  mergeParts,
  partsDuration,
  storedParts,
} from "../clips/parts"
import type { Segment, Word } from "../transcription/schema"
import { coveredShare, gameDialogueStretches } from "./game-dialogue"
import type { Candidate, RawCandidate, SelectionLimits } from "./types"

export const SNAP_WINDOW_MS = 1500
export const MAX_OVERLAP_RATIO = 0.2
export const GAME_DIALOGUE_PENALTY = 0.6
export const PAYOFF_SNAP_MS = 400

type Context = {
  durationMs: number
  words: readonly Word[]
  segments: readonly Segment[]
  limits: SelectionLimits
  language?: string
  exclude?: readonly TimeRange[]
  payoffStarts?: boolean
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

function overlapRatio(a: readonly TimeRange[], b: readonly TimeRange[]) {
  const overlap = a.reduce(
    (sum, x) =>
      b.reduce(
        (inner, y) =>
          inner +
          Math.max(
            0,
            Math.min(x.endMs, y.endMs) - Math.max(x.startMs, y.startMs)
          ),
        sum
      ),
    0
  )
  if (overlap <= 0) return 0
  return overlap / Math.min(partsDuration(a), partsDuration(b))
}

const crosses = (a: TimeRange, b: TimeRange) =>
  a.startMs < b.endMs && b.startMs < a.endMs

function fitParts(
  raw: readonly TimeRange[],
  { durationMs, words, limits }: Context,
  snapStart: (ms: number) => number,
  snapEnd: (ms: number) => number
): TimeRange[] {
  const parts: TimeRange[] = []
  for (const part of raw.slice(0, CLIP_MAX_PARTS)) {
    if (!Number.isFinite(part.startMs) || !Number.isFinite(part.endMs)) continue
    const clamp = (ms: number) =>
      Math.max(0, Math.min(durationMs, Math.round(ms)))
    const shaped = {
      startMs: snapStart(clamp(part.startMs)),
      endMs: snapEnd(clamp(part.endMs)),
    }
    if (shaped.endMs - shaped.startMs < CLIP_PART_MIN_MS) continue
    if (parts.some((other) => crosses(shaped, other))) continue
    parts.push(shaped)
  }
  while (parts.length > 0 && partsDuration(parts) > limits.maxMs) {
    const last = parts.at(-1)!
    const limit = last.endMs - (partsDuration(parts) - limits.maxMs)
    if (limit - last.startMs < CLIP_PART_MIN_MS) {
      parts.pop()
      continue
    }
    const ends = words
      .map((w) => w.endMs)
      .filter((e) => e >= last.startMs + CLIP_PART_MIN_MS && e <= limit)
    last.endMs = ends.length ? Math.max(...ends) : limit
  }
  const last = parts.at(-1)
  const missing = limits.minMs - partsDuration(parts)
  if (last && missing > 0) {
    const longer = {
      ...last,
      endMs: Math.min(durationMs, last.endMs + missing),
    }
    if (!parts.some((other) => other !== last && crosses(longer, other))) {
      last.endMs = longer.endMs
    }
  }
  return partsDuration(parts) >= limits.minMs
    ? mergeParts(parts, CLIP_PART_MIN_MS)
    : []
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

  const snapStart = (ms: number) =>
    context.payoffStarts
      ? (nearest(wordStarts, ms, PAYOFF_SNAP_MS) ?? ms)
      : snap(ms, sentenceStarts, wordStarts)
  const snapEnd = (ms: number) => snap(ms, sentenceEnds, wordEnds)
  const text = (candidate: RawCandidate) => ({
    title: candidate.title.trim().slice(0, 100) || "Untitled clip",
    hook: candidate.hook.trim().slice(0, 200),
    ...(candidate.description === undefined
      ? {}
      : { description: candidate.description.trim().slice(0, 1000) }),
    reason: candidate.reason.trim().slice(0, 500),
  })
  const scoreOf = (candidate: RawCandidate) =>
    Number.isFinite(candidate.score)
      ? Math.min(1, Math.max(0, candidate.score))
      : 0

  const shaped: Candidate[] = []
  for (const given of raw) {
    const { parts: rawParts, ...single } = given
    const parts =
      rawParts && rawParts.length > 1
        ? fitParts(rawParts, context, snapStart, snapEnd)
        : (rawParts ?? [])
    if (rawParts && rawParts.length > 1 && parts.length === 0) continue
    if (parts.length > 1) {
      const total = partsDuration(parts)
      const penalty =
        (GAME_DIALOGUE_PENALTY *
          parts.reduce(
            (sum, part) =>
              sum +
              coveredShare(part, gameDialogue) * (part.endMs - part.startMs),
            0
          )) /
        total
      const beats = given.beats?.filter((b) =>
        parts.some((part) => b.ms >= part.startMs && b.ms <= part.endMs)
      )
      shaped.push({
        ...single,
        ...(beats ? { beats } : {}),
        ...storedParts(parts),
        parts,
        ...text(given),
        score: scoreOf(given) * (1 - penalty),
      })
      continue
    }
    const candidate = parts[0] ? { ...single, ...parts[0] } : single
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
    startMs = snapStart(startMs)
    endMs = snapEnd(endMs)
    if (endMs <= startMs) continue
    ;[startMs, endMs] = fitLength(startMs, endMs, context)
    const length = endMs - startMs
    if (length < limits.minMs || length > limits.maxMs || endMs > durationMs)
      continue
    const penalty =
      GAME_DIALOGUE_PENALTY * coveredShare({ startMs, endMs }, gameDialogue)
    const beats = candidate.beats?.filter(
      (b) => b.ms >= startMs && b.ms <= endMs
    )
    shaped.push({
      ...candidate,
      ...(beats ? { beats } : {}),
      startMs,
      endMs,
      ...text(candidate),
      score: scoreOf(candidate) * (1 - penalty),
    })
  }

  const taken = (context.exclude ?? []).map((range) => [range])
  const accepted: Candidate[] = []
  for (const candidate of [...shaped].sort((a, b) => b.score - a.score)) {
    const own = clipParts(candidate)
    if (
      [...taken, ...accepted.map(clipParts)].every(
        (other) => overlapRatio(own, other) <= MAX_OVERLAP_RATIO
      )
    ) {
      accepted.push(candidate)
    }
    if (accepted.length === limits.maxCount) break
  }
  return accepted
}
