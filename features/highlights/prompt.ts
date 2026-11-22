import { z } from "zod"

import { AppError } from "@/lib/errors"

import type { SignalsData } from "../analysis/schema"
import type { Segment } from "../transcription/schema"
import {
  candidatesResponseSchema,
  type RawCandidate,
  type SelectionLimits,
} from "./types"

const seconds = (ms: number) => (ms / 1000).toFixed(1)

export const SELECTION_SYSTEM_PROMPT = `You pick short-form highlight clips from long gameplay recordings that have a facecam. A good clip starts right before something happens, has a clear payoff (a reaction, a joke, a clutch play, a funny fail, a strong opinion) and makes sense without the rest of the video. Prefer moments where the streamer's speech and the audio energy both spike. Avoid clips that start mid-sentence, end before the payoff, or are mostly silence.

Write titles and hooks in the streamer's language. Titles are under 60 characters and say what happens. Hooks are the on-screen text for the first seconds, under 90 characters. The reason is one sentence an editor can check against the transcript. Score each clip from 0 to 1 by how likely it is to hold a viewer.`

export function buildSelectionPrompt({
  durationMs,
  segments,
  signals,
  limits,
}: {
  durationMs: number
  segments: readonly Segment[]
  signals: SignalsData
  limits: SelectionLimits
}) {
  const loudest = signals.loudness
    .map((lufs, i) => ({ lufs, ms: i * signals.loudnessIntervalMs }))
    .filter((p) => p.lufs > -70)
    .sort((a, b) => b.lufs - a.lufs)
    .slice(0, 15)
    .sort((a, b) => a.ms - b.ms)
    .map((p) => `${seconds(p.ms)}s (${p.lufs.toFixed(1)} LUFS)`)

  const transcript = segments.length
    ? segments
        .map((s) => `[${seconds(s.startMs)}–${seconds(s.endMs)}] ${s.text}`)
        .join("\n")
    : "(no speech detected)"

  return `Recording length: ${seconds(durationMs)} s.

Pick up to ${limits.maxCount} clips, each between ${seconds(limits.minMs)} and ${seconds(limits.maxMs)} seconds long, that don't overlap. Times are in milliseconds from the start of the recording; start and end on sentence boundaries from the transcript.

Loudest moments: ${loudest.join(", ") || "none"}
Silences: ${signals.silences.map((s) => `${seconds(s.startMs)}–${seconds(s.endMs)}s`).join(", ") || "none"}

Transcript (seconds):
${transcript}`
}

export function buildManualPrompt(
  input: Parameters<typeof buildSelectionPrompt>[0]
) {
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
