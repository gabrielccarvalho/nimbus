import { z } from "zod"

import { AppError } from "@/lib/errors"

import { cutClusters } from "../analysis/cuts"
import type { AudiencePoint, SignalsData, TimeRange } from "../analysis/schema"
import { isForeignSegment } from "../captions/speaker"
import type { Segment, Word } from "../transcription/schema"
import { gameDialogueStretches } from "./game-dialogue"
import type { NicheProfile } from "./niches"
import {
  candidatesResponseSchema,
  type RawCandidate,
  type SelectionLimits,
} from "./types"

const seconds = (ms: number) => (ms / 1000).toFixed(1)

export const SELECTION_SYSTEM_PROMPT = `You pick short-form clips (TikTok, Shorts, Reels) from long gameplay streams that have a facecam. A clip has to grab a viewer in its first seconds and pay off before it ends.

What makes a clip, best first:
1. Something crazy on screen — a bug or glitch, physics going wrong, a huge crash or explosion, a fight, shootout, chase, death, fail, clutch play, jump scare — with the streamer reacting out loud. Glitches often show up only as the streamer's disbelief ("what?", "bro", laughing, "did you see that"), so treat sudden confusion or disbelief as a strong sign.
2. A big streamer reaction — screaming, panicking, raging, losing it laughing, disbelief — to something that just happened on screen.
3. A funny bit or a heated, quotable rant, only when the streamer is clearly fired up.

The best moments usually show up as a burst of short, loud lines from the streamer (swearing, shouting, repeated words) together with an audio spike.

Don't pick:
- Cutscenes and story dialogue, even when the streamer comments over them. Signs: game characters talking for a long stretch, lines marked (game), the streamer quiet or narrating the plot, runs of hard camera cuts.
- Menus, maps, shops, settings, loading screens, customization, tutorials.
- Calm driving, walking or exploring, reading messages, admiring graphics or music, talking to chat about the game, performance or the stream.

Viewers swipe away in the first two seconds, so a clip starts at most a second or two before the payoff, never with a slow build-up, and ends right after the reaction lands. It has to make sense without the rest of the video. When the stream runs out of action, fill the list with the strongest reactions left and score them honestly, but never with anything from the "don't pick" list.

Write titles and hooks in the streamer's language. Titles are under 60 characters and say what happens. Hooks are the on-screen text for the first seconds, under 90 characters. Each clip also gets a description for the video page: one or two sentences in the same language that say what happens, with no hashtags. The reason is one sentence an editor can check against the transcript: what happens in the game and how the streamer reacts. Score each clip from 0 to 1 by how likely it is to hold a viewer: above 0.8 only for real action with a loud reaction, under 0.3 for anything from the "don't pick" list.`

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
  audience?: readonly AudiencePoint[]
  exclude?: readonly TimeRange[]
  niche?: NicheProfile
  part?: { index: number; count: number; startMs: number; endMs: number }
}

function segmentConfidence(segment: Segment, words: readonly Word[]) {
  const own = words.slice(segment.firstWord, segment.lastWord + 1)
  if (own.length === 0) return 1
  return own.reduce((sum, w) => sum + w.confidence, 0) / own.length
}

export function transcriptLines(
  {
    words,
    segments,
    language,
  }: Pick<PromptInput, "words" | "segments" | "language">,
  from: number,
  to: number
) {
  const inside = segments.filter((s) => s.startMs >= from && s.startMs < to)
  const mark = (s: Segment) =>
    isForeignSegment(s.text, language)
      ? " (game)"
      : segmentConfidence(s, words) < UNCLEAR_CONFIDENCE
        ? " (unclear)"
        : ""
  return inside.length
    ? inside
        .map(
          (s) =>
            `[${seconds(s.startMs)}–${seconds(s.endMs)}]${mark(s)} ${s.text}`
        )
        .join("\n")
    : "(no speech detected)"
}

export function buildSelectionPrompt({
  durationMs,
  words,
  segments,
  signals,
  limits,
  language,
  audience = [],
  exclude = [],
  niche,
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
  const median =
    [...audience].sort((a, b) => a.value - b.value)[
      Math.floor(audience.length / 2)
    ]?.value ?? 0
  const rewatched = audience
    .filter((p) => p.endMs > from && p.startMs < to && p.value > median)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .sort((a, b) => a.startMs - b.startMs)
    .map(
      (p) =>
        `${seconds(p.startMs)}–${seconds(p.endMs)}s (${p.value.toFixed(2)})`
    )
  const within = (r: TimeRange) => r.endMs > from && r.startMs < to
  const gameDialogue = gameDialogueStretches(words, language)
    .filter(within)
    .map((r) => `${seconds(r.startMs)}–${seconds(r.endMs)}s`)
  const cuts = cutClusters(signals.cuts ?? [])
    .filter(within)
    .map((c) => `${seconds(c.startMs)}–${seconds(c.endMs)}s (${c.count} cuts)`)
  const transcript = transcriptLines({ words, segments, language }, from, to)

  const spoken =
    language && language !== "auto"
      ? `The streamer speaks ${languageName(language)}. Game audio in other languages appears in the transcript, marked (game) or (unclear); it isn't the streamer reacting. Write titles and hooks in ${languageName(language)}.`
      : "Write titles and hooks in the language the streamer speaks."

  return `Recording length: ${seconds(durationMs)} s.${part ? ` This is part ${part.index + 1} of ${part.count}, from ${seconds(from)} s to ${seconds(to)} s; only pick clips inside it.` : ""}

${spoken}
${niche ? `\nThe game is ${niche.label}. For this niche, look hardest for:\n${niche.lookFor.map((item) => `- ${item}`).join("\n")}\n` : ""}
Pick up to ${limits.maxCount} clips, each between ${seconds(limits.minMs)} and ${seconds(limits.maxMs)} seconds long, that don't overlap. Times are in milliseconds from the start of the recording; start on the payoff and end on a sentence boundary from the transcript.

${exclude.length ? `Already clipped, don't pick these again or anything overlapping them: ${exclude.map((r) => `${seconds(r.startMs)}–${seconds(r.endMs)}s`).join(", ")}\n\n` : ""}Loudest moments: ${loudest.join(", ") || "none"}
Silences: ${silences.map((s) => `${seconds(s.startMs)}–${seconds(s.endMs)}s`).join(", ") || "none"}
${gameDialogue.length ? `Game characters talking, likely cutscenes: ${gameDialogue.join(", ")}\n` : ""}${cuts.length ? `Runs of hard camera cuts (gameplay cameras rarely cut, so these are usually cutscenes, menus or fail screens; a chase or fight can cut too): ${cuts.join(", ")}\n` : ""}${rewatched.length ? `Most rewatched on YouTube (viewer replays, 1 = the most replayed part of the video; each range is coarse, so find the moment inside it): ${rewatched.join(", ")}\n` : ""}
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
{"clips":[{"startMs":12000,"endMs":41000,"title":"…","hook":"…","description":"…","reason":"…","score":0.8}]}`
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
          description: z.string().optional(),
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
