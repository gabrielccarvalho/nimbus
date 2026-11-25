import type { Beat, Effect } from "@/features/effects/schema"
import type { Word } from "@/features/transcription/schema"

export type RetentionPoint = { ratio: number; watch: number }

export const STATS_SYNC_AGES_DAYS = [1, 2, 7, 28] as const
export const STATS_LAG_MS = 72 * 3_600_000
export const STATS_SCHEDULE_INTERVAL_MS = 30 * 60_000

const DAY_MS = 86_400_000
const MOMENT_THRESHOLD = 0.05
const MAX_DROPS = 3
const MAX_RISES = 2
const CONTEXT_WINDOW_MS = 1_000
const MIN_PEERS = 3

export function statsSyncDue(
  publishedAt: Date,
  lastFetchedAt: Date | null,
  now: Date
): boolean {
  return STATS_SYNC_AGES_DAYS.some((age) => {
    const dueAt = publishedAt.getTime() + age * DAY_MS
    return (
      dueAt <= now.getTime() &&
      (lastFetchedAt === null || lastFetchedAt.getTime() < dueAt)
    )
  })
}

export function statsEarly(publishedAt: Date, now: Date): boolean {
  return now.getTime() - publishedAt.getTime() < STATS_LAG_MS
}

export type RetentionMoment = {
  atMs: number
  kind: "drop" | "rise"
  change: number
  words: string
  beats: Beat["kind"][]
  effects: Effect["kind"][]
}

type Range = { startMs: number; endMs: number }

export function retentionMoments(
  curve: readonly RetentionPoint[],
  range: Range,
  context: {
    words: readonly Word[]
    beats: readonly Beat[]
    effects: readonly Effect[]
  }
): RetentionMoment[] {
  const duration = range.endMs - range.startMs
  const changes = curve.slice(1).map((point, i) => ({
    atMs: Math.round((point.ratio * duration) / 100) * 100,
    change: point.watch - curve[i]!.watch,
  }))
  const drops = changes
    .filter((c) => c.change <= -MOMENT_THRESHOLD)
    .sort((a, b) => a.change - b.change)
    .slice(0, MAX_DROPS)
    .map((c) => ({ ...c, kind: "drop" as const }))
  const rises = changes
    .filter((c) => c.change >= MOMENT_THRESHOLD)
    .sort((a, b) => b.change - a.change)
    .slice(0, MAX_RISES)
    .map((c) => ({ ...c, kind: "rise" as const }))

  return [...drops, ...rises]
    .sort((a, b) => a.atMs - b.atMs)
    .map(({ atMs, kind, change }) => {
      const from = range.startMs + atMs - CONTEXT_WINDOW_MS
      const to = range.startMs + atMs + CONTEXT_WINDOW_MS
      return {
        atMs,
        kind,
        change,
        words: context.words
          .filter((w) => w.endMs >= from && w.startMs <= to)
          .map((w) => w.text)
          .join(" "),
        beats: [
          ...new Set(
            context.beats
              .filter((b) => b.ms >= from && b.ms <= to)
              .map((b) => b.kind)
          ),
        ],
        effects: [
          ...new Set(
            context.effects
              .filter((e) => e.endMs >= from && e.startMs <= to)
              .map((e) => e.kind)
          ),
        ],
      }
    })
}

export type PerformanceSample = {
  publicationId: string
  ageDays: number
  views: number
}

function ageBucket(ageDays: number): number | null {
  const fits = STATS_SYNC_AGES_DAYS.filter((age) => age <= ageDays)
  return fits.length ? fits[fits.length - 1]! : null
}

export function relativePerformance(
  target: PerformanceSample,
  samples: readonly PerformanceSample[]
): number | null {
  const bucket = ageBucket(target.ageDays)
  if (bucket === null) return null
  const peers = samples
    .filter(
      (s) =>
        s.publicationId !== target.publicationId &&
        ageBucket(s.ageDays) === bucket
    )
    .map((s) => s.views)
    .sort((a, b) => a - b)
  if (peers.length < MIN_PEERS) return null
  const mid = Math.floor(peers.length / 2)
  const median =
    peers.length % 2 ? peers[mid]! : (peers[mid - 1]! + peers[mid]!) / 2
  return median > 0 ? target.views / median : null
}

export function markerRatios(range: Range, beats: readonly Beat[]): number[] {
  const duration = range.endMs - range.startMs
  return beats
    .filter((b) => b.ms >= range.startMs && b.ms <= range.endMs)
    .map((b) => (b.ms - range.startMs) / duration)
}
