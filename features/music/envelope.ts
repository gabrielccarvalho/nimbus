import type { TimeRange } from "@/features/analysis/schema"
import {
  DEFAULT_PAGING,
  spokenEnd,
  type CaptionWord,
} from "@/features/captions/pages"
import type { AudioMix } from "./schema"

export const SPEECH_MERGE_GAP_MS = 400
export const DUCK_DB = -10
export const DUCK_RAMP_MS = 200

export type MusicPlan = {
  musicDb: number
  lengthMs: number
  fadeInMs: number
  fadeOutMs: number
  duck: TimeRange[]
}
export type AudioPlan = { sourceDb: number; music: MusicPlan | null }

export function dbToGain(db: number) {
  return 10 ** (db / 20)
}

export function speechIntervals(
  words: readonly CaptionWord[],
  durationMs: number
): TimeRange[] {
  const spans = words
    .map((word) => ({
      startMs: Math.max(0, word.startMs),
      endMs: Math.min(durationMs, spokenEnd(word, DEFAULT_PAGING)),
    }))
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const merged: TimeRange[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.startMs - last.endMs < SPEECH_MERGE_GAP_MS) {
      last.endMs = Math.max(last.endMs, span.endMs)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

export function duckDbAt(intervals: readonly TimeRange[], tMs: number) {
  let weight = 0
  for (const { startMs, endMs } of intervals) {
    if (tMs >= startMs && tMs <= endMs) weight += 1
    else if (tMs < startMs)
      weight += Math.max(0, 1 - (startMs - tMs) / DUCK_RAMP_MS)
    else weight += Math.max(0, 1 - (tMs - endMs) / DUCK_RAMP_MS)
  }
  return weight === 0 ? 0 : DUCK_DB * Math.min(1, weight)
}

export function planAudio(
  mix: AudioMix | null,
  track: { durationMs: number } | null,
  clipDurationMs: number,
  words: readonly CaptionWord[]
): AudioPlan | null {
  if (!mix) return null
  const lengthMs = track
    ? Math.min(clipDurationMs, track.durationMs - mix.trackStartMs)
    : 0
  if (mix.trackId === null || !track || lengthMs <= 0) {
    return { sourceDb: mix.sourceDb, music: null }
  }
  const fadeInMs = Math.min(mix.fadeInMs, lengthMs)
  const fadeOutMs = Math.min(mix.fadeOutMs, lengthMs - fadeInMs)
  return {
    sourceDb: mix.sourceDb,
    music: {
      musicDb: mix.musicDb,
      lengthMs,
      fadeInMs,
      fadeOutMs,
      duck: mix.duck ? speechIntervals(words, lengthMs) : [],
    },
  }
}

export function musicGainAt(plan: MusicPlan, tMs: number) {
  if (tMs < 0 || tMs >= plan.lengthMs) return 0
  const fadeIn = plan.fadeInMs > 0 ? Math.min(1, tMs / plan.fadeInMs) : 1
  const fadeOut =
    plan.fadeOutMs > 0 ? Math.min(1, (plan.lengthMs - tMs) / plan.fadeOutMs) : 1
  return dbToGain(plan.musicDb + duckDbAt(plan.duck, tMs)) * fadeIn * fadeOut
}
