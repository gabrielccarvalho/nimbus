import type { PublicationOrigin } from "./schema"
import type { Beat, Effect } from "@/features/effects/schema"
import type { Word } from "@/features/transcription/schema"

export type RetentionPoint = { ratio: number; watch: number }

export const STATS_SYNC_AGES_DAYS = [1, 2, 7, 28] as const
export const STATS_RESYNC_DAYS = 28
export const STATS_LAG_MS = 72 * 3_600_000
export const STATS_SCHEDULE_INTERVAL_MS = 30 * 60_000
export const DAILY_BACKFILL_RETRY_MS = 24 * 3_600_000
export const YOUTUBE_DATA_TTL_MS = 30 * 86_400_000
export const RETENTION_SWEEP_EVERY_MS = 24 * 3_600_000

const DAY_MS = 86_400_000
const MOMENT_THRESHOLD = 0.05
const MAX_DROPS = 3
const MAX_RISES = 2
const CONTEXT_WINDOW_MS = 1_000

export function statsSyncDue(
  publication: { publishedAt: Date; origin: PublicationOrigin },
  lastFetchedAt: Date | null,
  now: Date
): boolean {
  const resyncDue =
    lastFetchedAt === null ||
    lastFetchedAt.getTime() <= now.getTime() - STATS_RESYNC_DAYS * DAY_MS
  if (publication.origin === "imported") return resyncDue
  const publishedMs = publication.publishedAt.getTime()
  if (now.getTime() - publishedMs >= STATS_RESYNC_DAYS * DAY_MS && resyncDue) {
    return true
  }
  return STATS_SYNC_AGES_DAYS.some((age) => {
    const dueAt = publishedMs + age * DAY_MS
    return (
      dueAt <= now.getTime() &&
      (lastFetchedAt === null || lastFetchedAt.getTime() < dueAt)
    )
  })
}

export function dailyBackfillDue(
  publishedAt: Date,
  lastFetchedAt: Date | null,
  now: Date
): boolean {
  return (
    now.getTime() - publishedAt.getTime() >= DAY_MS &&
    (lastFetchedAt === null ||
      lastFetchedAt.getTime() <= now.getTime() - DAILY_BACKFILL_RETRY_MS)
  )
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

export function markerRatios(range: Range, beats: readonly Beat[]): number[] {
  const duration = range.endMs - range.startMs
  return beats
    .filter((b) => b.ms >= range.startMs && b.ms <= range.endMs)
    .map((b) => (b.ms - range.startMs) / duration)
}
