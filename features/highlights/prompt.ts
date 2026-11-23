import { z } from "zod"

import { AppError } from "@/lib/errors"

import type { SignalsData, TimeRange } from "../analysis/schema"
import type { Segment, Word } from "../transcription/schema"
import {
  candidatesResponseSchema,
  type RawCandidate,
  type SelectionLimits,
} from "./types"

const seconds = (ms: number) => (ms / 1000).toFixed(1)

export const SELECTION_SYSTEM_PROMPT = `You pick short-form highlight clips from long gameplay recordings that have a facecam. A good clip starts right before something happens, has a clear payoff (a reaction, a joke, a clutch play, a funny fail, a strong opinion) and makes sense without the rest of the video. Prefer moments where the streamer's speech and the audio energy both spike. Avoid clips that start mid-sentence, end before the payoff, or are mostly silence.

Write titles and hooks in the streamer's language. Titles are under 60 characters and say what happens. Hooks are the on-screen text for the first seconds, under 90 characters. The reason is one sentence an editor can check against the transcript. Score each clip from 0 to 1 by how likely it is to hold a viewer.`

const UNCLEAR_CONFIDENCE = 0.5

export function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

export type PromptInput = {
  durationMs: number
  words: readonly Word[]
  segments: readonly Segment[]
  signals: SignalsData
  limits: SelectionLimits
  language: string
  exclude?: readonly TimeRange[]
  part?: { index: number; count: number; startMs: number; endMs: number }
}

function segmentConfidence(segment: Segment, words: readonly Word[]) {
  const own = words.slice(segment.firstWord, segment.lastWord + 1)
  if (own.length === 0) return 1
  return own.reduce((sum, w) => sum + w.confidence, 0) / own.length
}

export function buildSelectionPrompt({
  durationMs,
  words,
  segments,
  signals,
  limits,
  language,
  exclude = [],
  part,
}: PromptInput) {
  const from = part?.startMs ?? 0
  const to = part?.endMs ?? durationMs
  const loudest = signals.loudness
    .map((lufs, i) => ({ lufs, ms: i * signals.loudnessIntervalMs }))
    .filter((p) => p.lufs > -70 && p.ms >= from && p.ms < to)
    .sort((a, b) => b.lufs - a.lufs)
    .slice(0, 15)
    .sort((a, b) => a.ms - b.ms)
    .map((p) => `${seconds(p.ms)}s (${p.lufs.toFixed(1)} LUFS)`)
  const silences = signals.silences.filter(
    (s) => s.endMs > from && s.startMs < to
  )
  const inside = segments.filter((s) => s.startMs >= from && s.startMs < to)

  const transcript = inside.length
    ? inside
        .map(
          (s) =>
            `[${seconds(s.startMs)}–${seconds(s.endMs)}]${segmentConfidence(s, words) < UNCLEAR_CONFIDENCE ? " (unclear)" : ""} ${s.text}`
        )
        .join("\n")
    : "(no speech detected)"

  const spoken =
    language && language !== "auto"
      ? `The streamer speaks ${languageName(language)}. Game audio in other languages can appear in the transcript, often marked (unclear); it isn't the streamer reacting. Write titles and hooks in ${languageName(language)}.`
      : "Write titles and hooks in the language the streamer speaks."

  return `Recording length: ${seconds(durationMs)} s.${part ? ` This is part ${part.index + 1} of ${part.count}, from ${seconds(from)} s to ${seconds(to)} s; only pick clips inside it.` : ""}

${spoken}

Pick up to ${limits.maxCount} clips, each between ${seconds(limits.minMs)} and ${seconds(limits.maxMs)} seconds long, that don't overlap. Times are in milliseconds from the start of the recording; start and end on sentence boundaries from the transcript.

${exclude.length ? `Already clipped, don't pick these again or anything overlapping them: ${exclude.map((r) => `${seconds(r.startMs)}–${seconds(r.endMs)}s`).join(", ")}\n\n` : ""}Loudest moments: ${loudest.join(", ") || "none"}
Silences: ${silences.map((s) => `${seconds(s.startMs)}–${seconds(s.endMs)}s`).join(", ") || "none"}

Transcript (seconds):
${transcript}`
}

export function chunkRanges(
  segments: readonly Segment[],
  durationMs: number,
  { maxChars = 60_000, overlapMs = 60_000 } = {}
) {
  const total = segments.reduce((sum, s) => sum + s.text.length + 20, 0)
  const count = Math.max(1, Math.ceil(total / maxChars))
  if (count === 1) return [{ startMs: 0, endMs: durationMs }]
  const target = total / count
  const cuts: number[] = []
  let running = 0
  for (const segment of segments) {
    running += segment.text.length + 20
    if (running >= target * (cuts.length + 1) && cuts.length < count - 1) {
      cuts.push(segment.endMs)
    }
  }
  const bounds = [0, ...cuts, durationMs]
  return bounds.slice(0, -1).map((start, i) => ({
    startMs: Math.max(0, start - (i > 0 ? overlapMs : 0)),
    endMs: bounds[i + 1]!,
  }))
}

export function buildManualPrompt(input: PromptInput) {
  return `${SELECTION_SYSTEM_PROMPT}

${buildSelectionPrompt(input)}

Reply with only JSON in this shape, no prose:
{"clips":[{"startMs":12000,"endMs":41000,"title":"…","hook":"…","reason":"…","score":0.8}]}`
}

export function parseCandidatesJson(text: string): RawCandidate[] {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) {
    throw new AppError(
      "VALIDATION",
      'Paste the JSON object that starts with {"clips":'
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AppError("VALIDATION", "That isn't valid JSON")
  }
  const loose = z
    .object({
      clips: z.array(
        z.object({
          startMs: z.coerce.number(),
          endMs: z.coerce.number(),
          title: z.string().default(""),
          hook: z.string().default(""),
          reason: z.string().default(""),
          score: z.coerce.number().default(0.5),
        })
      ),
    })
    .safeParse(raw)
  if (!loose.success) {
    const issue = loose.error.issues[0]
    throw new AppError(
      "VALIDATION",
      `The JSON doesn't match the expected shape${issue ? ` (${issue.path.join(".")}: ${issue.message})` : ""}`
    )
  }
  return candidatesResponseSchema.parse(loose.data).clips
}
