import { normalizeLoudness } from "../analysis/loudness"
import type { Segment } from "../transcription/schema"
import type { HighlightSelector, RawCandidate, SelectorInput } from "./types"

export const HEURISTIC_WEIGHTS = {
  loudness: 0.45,
  density: 0.3,
  keywords: 0.15,
  questionAnswer: 0.1,
} as const

const KEYWORDS = [
  "no way",
  "let's go",
  "lets go",
  "oh my god",
  "insane",
  "crazy",
  "clutch",
  "wait",
  "what",
  "wow",
  "holy",
  "yes",
  "did it",
  "unbelievable",
  "laugh",
]

const ANCHOR_STEP_MS = 5000

function percentile(values: readonly number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

function keywordHits(text: string) {
  const lower = text.toLowerCase()
  return KEYWORDS.reduce((sum, keyword) => {
    const pattern = new RegExp(`\\b${keyword.replace(/'/g, "'?")}\\b`, "g")
    return sum + (lower.match(pattern)?.length ?? 0)
  }, 0)
}

function hasQuestionAnswer(segments: readonly Segment[]) {
  return segments.some(
    (segment, i) =>
      segment.text.trim().endsWith("?") &&
      segments[i + 1] &&
      !segments[i + 1]!.text.trim().endsWith("?")
  )
}

function shorten(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`
}

type Window = {
  startMs: number
  endMs: number
  loudness: number
  density: number
  keywords: number
  questionAnswer: number
  segments: Segment[]
}

export function scoreWindows(
  input: Omit<SelectorInput, "signal">
): RawCandidate[] {
  const { durationMs, words, segments, signals, limits } = input
  if (durationMs <= 0) return []
  const loudness = normalizeLoudness(signals.loudness)
  const interval = signals.loudnessIntervalMs
  const lengths = [
    ...new Set([limits.minMs, Math.round((limits.minMs + limits.maxMs) / 2)]),
  ]

  const anchors = new Set<number>(segments.map((s) => s.startMs))
  for (let ms = 0; ms < durationMs; ms += ANCHOR_STEP_MS) anchors.add(ms)

  const windows: Window[] = []
  for (const startMs of [...anchors].sort((a, b) => a - b)) {
    for (const length of lengths) {
      const endMs = Math.min(durationMs, startMs + length)
      if (endMs - startMs < Math.min(limits.minMs, durationMs)) continue
      const slice = loudness.slice(
        Math.floor(startMs / interval),
        Math.ceil(endMs / interval)
      )
      const wordCount = words.filter(
        (w) => w.startMs >= startMs && w.startMs < endMs
      ).length
      const inside = segments.filter(
        (s) => s.startMs >= startMs && s.startMs < endMs
      )
      windows.push({
        startMs,
        endMs,
        loudness: percentile(slice, 0.9),
        density: wordCount / ((endMs - startMs) / 1000),
        keywords: keywordHits(inside.map((s) => s.text).join(" ")),
        questionAnswer: hasQuestionAnswer(inside) ? 1 : 0,
        segments: inside,
      })
    }
  }

  const max = (key: "loudness" | "density" | "keywords") =>
    Math.max(...windows.map((w) => w[key]), 0) || 1
  const maxLoudness = max("loudness")
  const maxDensity = max("density")
  const maxKeywords = max("keywords")

  return windows.map((window) => {
    const parts = {
      loudness: window.loudness / maxLoudness,
      density: window.density / maxDensity,
      keywords: window.keywords / maxKeywords,
      questionAnswer: window.questionAnswer,
    }
    const score =
      HEURISTIC_WEIGHTS.loudness * parts.loudness +
      HEURISTIC_WEIGHTS.density * parts.density +
      HEURISTIC_WEIGHTS.keywords * parts.keywords +
      HEURISTIC_WEIGHTS.questionAnswer * parts.questionAnswer
    const hookSegment =
      [...window.segments].sort(
        (a, b) => keywordHits(b.text) - keywordHits(a.text)
      )[0] ?? window.segments[0]
    const reasons = [
      parts.loudness >= 0.8 && "loud peak",
      parts.density >= 0.8 && "fast talking",
      window.keywords > 0 &&
        `${window.keywords} hype ${window.keywords === 1 ? "word" : "words"}`,
      window.questionAnswer && "question and answer",
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
