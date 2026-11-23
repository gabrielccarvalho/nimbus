import { normalizeLoudness } from "../analysis/loudness"
import type { AudiencePoint } from "../analysis/schema"
import type { Segment, Word } from "../transcription/schema"
import {
  countPhrases,
  isExclamation,
  isLaughter,
  normalizeText,
  reactionPhrases,
} from "./phrases"
import type { HighlightSelector, RawCandidate, SelectorInput } from "./types"

export const HEURISTIC_WEIGHTS = {
  loudnessSpike: 0.3,
  speechRate: 0.15,
  excitement: 0.15,
  phrases: 0.15,
  repetition: 0.1,
  pauseBeforePeak: 0.1,
  questionAnswer: 0.05,
  audience: 0.2,
} as const

type Feature = keyof typeof HEURISTIC_WEIGHTS

const ANCHOR_STEP_MS = 5000
const BASELINE_MS = 120_000
const PAUSE_BEFORE_PEAK_MS = 3000
const REPEAT_GAP_MS = 3000
const BASELINE_MARGIN = 1.5
// YouTube already scales the heatmap to 0–1 per video, so it's scored on that
// scale: rescaling like the other signals would turn a flat heatmap's noise into
// full weight.
const AUDIENCE_FULL_ABOVE_MEDIAN = 0.5

function percentile(values: readonly number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

function prefixSums(values: readonly number[]) {
  const sums = new Float64Array(values.length + 1)
  values.forEach((value, i) => (sums[i + 1] = sums[i]! + value))
  return (from: number, to: number) => {
    const a = Math.max(0, Math.min(values.length, from))
    const b = Math.max(a, Math.min(values.length, to))
    return sums[b]! - sums[a]!
  }
}

function lowerBound(values: readonly number[], target: number) {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid]! < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function shorten(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`
}

function repeatedWords(words: readonly Word[]) {
  return words.map((word, i) => {
    if (i < 2) return 0
    const key = normalizeText(word.text)
    if (key.length < 2) return 0
    const a = words[i - 1]!
    const b = words[i - 2]!
    return normalizeText(a.text) === key &&
      normalizeText(b.text) === key &&
      word.startMs - b.startMs <= REPEAT_GAP_MS
      ? 1
      : 0
  })
}

function audienceAbove(points: readonly AudiencePoint[]) {
  const median = percentile(
    points.map((p) => p.value),
    0.5
  )
  return (from: number, to: number) => {
    let weighted = 0
    let covered = 0
    for (const point of points) {
      const overlap = Math.min(to, point.endMs) - Math.max(from, point.startMs)
      if (overlap <= 0) continue
      weighted += point.value * overlap
      covered += overlap
    }
    return covered > 0 ? Math.max(0, weighted / covered - median) : 0
  }
}

type Window = {
  startMs: number
  endMs: number
  values: Record<Feature, number>
  confidence: number
  segments: Segment[]
}

export function scoreWindows(
  input: Omit<SelectorInput, "signal">
): RawCandidate[] {
  const { durationMs, words, segments, signals, limits } = input
  if (durationMs <= 0) return []
  const phrases = reactionPhrases(input.language, input.reactionPhrases)
  const loudness = normalizeLoudness(signals.loudness)
  const interval = signals.loudnessIntervalMs
  const loudnessSum = prefixSums(loudness)
  const wordStarts = words.map((w) => w.startMs)
  const wordsIn = (from: number, to: number): [number, number] => [
    lowerBound(wordStarts, from),
    lowerBound(wordStarts, to),
  ]
  const confidenceSum = prefixSums(words.map((w) => w.confidence))
  const excitedSum = prefixSums(
    words.map((w) => (isExclamation(w.text) || isLaughter(w.text) ? 1 : 0))
  )
  const repeatSum = prefixSums(repeatedWords(words))
  const segmentStarts = segments.map((s) => s.startMs)
  const segmentPhrases = segments.map((s) => countPhrases(s.text, phrases))
  const phraseSum = prefixSums(segmentPhrases)
  const silenceEnds = signals.silences.map((s) => s.endMs).sort((a, b) => a - b)
  const audience = audienceAbove(input.audience ?? [])
  const features = (Object.keys(HEURISTIC_WEIGHTS) as Feature[]).filter(
    (key) => key !== "audience" || (input.audience?.length ?? 0) > 0
  )
  const totalWeight = features.reduce(
    (sum, key) => sum + HEURISTIC_WEIGHTS[key],
    0
  )

  const rate = (from: number, to: number) => {
    const [a, b] = wordsIn(from, to)
    return (b - a) / Math.max(1, (to - from) / 1000)
  }
  const meanLoudness = (from: number, to: number) => {
    const a = Math.floor(from / interval)
    const b = Math.ceil(to / interval)
    return b > a ? loudnessSum(a, b) / (b - a) : 0
  }

  const lengths = [
    ...new Set([limits.minMs, Math.round((limits.minMs + limits.maxMs) / 2)]),
  ]
  const anchors = new Set<number>(segmentStarts)
  for (let ms = 0; ms < durationMs; ms += ANCHOR_STEP_MS) anchors.add(ms)

  const windows: Window[] = []
  for (const startMs of [...anchors].sort((a, b) => a - b)) {
    for (const length of lengths) {
      const endMs = Math.min(durationMs, startMs + length)
      if (endMs - startMs < Math.min(limits.minMs, durationMs)) continue
      const from = Math.floor(startMs / interval)
      const slice = loudness.slice(from, Math.ceil(endMs / interval))
      let peakIndex = 0
      slice.forEach((v, i) => {
        if (v > slice[peakIndex]!) peakIndex = i
      })
      const peakMs = (from + peakIndex) * interval
      const baseFrom = Math.max(0, startMs - BASELINE_MS)
      const baseTo = Math.min(durationMs, endMs + BASELINE_MS)
      const [wa, wb] = wordsIn(startMs, endMs)
      const sa = lowerBound(segmentStarts, startMs)
      const sb = lowerBound(segmentStarts, endMs)
      const inside = segments.slice(sa, sb)
      const pause =
        silenceEnds[lowerBound(silenceEnds, peakMs - PAUSE_BEFORE_PEAK_MS)]
      const baselineRate = rate(baseFrom, baseTo)
      const [ba, bb] = wordsIn(baseFrom, baseTo)
      const bsa = lowerBound(segmentStarts, baseFrom)
      const bsb = lowerBound(segmentStarts, baseTo)
      const share = (endMs - startMs) / Math.max(1, baseTo - baseFrom)
      windows.push({
        startMs,
        endMs,
        values: {
          loudnessSpike: Math.max(
            0,
            percentile(slice, 0.9) - meanLoudness(baseFrom, baseTo)
          ),
          speechRate:
            baselineRate > 0
              ? Math.min(
                  2,
                  Math.max(0, rate(startMs, endMs) / baselineRate - 1)
                )
              : 0,
          excitement: Math.max(
            0,
            excitedSum(wa, wb) - BASELINE_MARGIN * share * excitedSum(ba, bb)
          ),
          phrases: Math.max(
            0,
            phraseSum(sa, sb) - BASELINE_MARGIN * share * phraseSum(bsa, bsb)
          ),
          repetition: repeatSum(wa, wb),
          pauseBeforePeak:
            pause !== undefined && pause <= peakMs && pause >= startMs ? 1 : 0,
          questionAnswer: inside.some(
            (segment, i) =>
              segment.text.trim().endsWith("?") &&
              inside[i + 1] &&
              !inside[i + 1]!.text.trim().endsWith("?")
          )
            ? 1
            : 0,
          audience: audience(startMs, endMs),
        },
        confidence: wb > wa ? confidenceSum(wa, wb) / (wb - wa) : 1,
        segments: inside,
      })
    }
  }

  const scale = Object.fromEntries(
    features.map((key) => {
      if (key === "audience") return [key, AUDIENCE_FULL_ABOVE_MEDIAN]
      const nonZero = windows.map((w) => w.values[key]).filter((v) => v > 0)
      return [key, percentile(nonZero, 0.95) || 1]
    })
  ) as Record<Feature, number>

  return windows.map((window) => {
    const parts = Object.fromEntries(
      (Object.keys(HEURISTIC_WEIGHTS) as Feature[]).map((key) => [
        key,
        features.includes(key)
          ? Math.min(1, window.values[key] / scale[key])
          : 0,
      ])
    ) as Record<Feature, number>
    const raw =
      features.reduce(
        (sum, key) => sum + HEURISTIC_WEIGHTS[key] * parts[key],
        0
      ) / totalWeight
    const score = raw * (0.4 + 0.6 * window.confidence)
    const hookSegment =
      window.segments.find(
        (segment) =>
          /[!?¡¿]/.test(segment.text) || countPhrases(segment.text, phrases) > 0
      ) ?? window.segments[0]
    const reasons = [
      parts.loudnessSpike >= 0.8 && "loud spike",
      parts.speechRate >= 0.8 && "talking faster",
      parts.excitement >= 0.5 && "laughing or shouting",
      parts.phrases >= 0.5 && "reaction phrases",
      parts.audience >= 0.6 && "rewatched most on YouTube",
      window.values.repetition > 0 && "repeated words",
      window.values.pauseBeforePeak && "pause before the peak",
      window.values.questionAnswer && "question and answer",
      window.confidence < 0.6 && "unclear speech, scored lower",
    ].filter(Boolean)
    return {
      startMs: window.startMs,
      endMs: window.endMs,
      title: shorten(window.segments[0]?.text ?? "Highlight", 60),
      hook: shorten(hookSegment?.text ?? "", 120),
      reason: reasons.length
        ? `Heuristic: ${reasons.join(", ")}`
        : "Heuristic: steady activity",
      score: Math.round(score * 1000) / 1000,
    }
  })
}

export class HeuristicSelector implements HighlightSelector {
  readonly id = "heuristic"

  async select(input: SelectorInput) {
    return scoreWindows(input)
  }
}
