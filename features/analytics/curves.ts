import type { AnalyticsPeriod, ChannelContentType, ChannelDay } from "./schema"

export const AGE_CAP_DAYS = 28
export const MIN_RATIO_AGE_DAYS = 2
export const MIN_PEERS = 3

const DAY_MS = 86_400_000

function dayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

export function addDays(day: string, days: number): string {
  return new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS)
}

export function cumulativeViews(
  rows: readonly { day: string; views: number }[],
  publishedDay: string,
  throughDay: string
): number[] {
  const span = daysBetween(publishedDay, throughDay)
  if (span < 0) return []
  const byDay = new Map(rows.map((row) => [row.day, row.views]))
  const curve: number[] = []
  let total = 0
  for (let d = 0; d <= Math.min(span, AGE_CAP_DAYS); d++) {
    total += byDay.get(addDays(publishedDay, d)) ?? 0
    curve.push(total)
  }
  return curve
}

export type ViewCurve = { publicationId: string; cumulative: number[] }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function relativePerformance(
  target: ViewCurve,
  peers: readonly ViewCurve[]
): number | null {
  const age = target.cumulative.length - 1
  if (age < MIN_RATIO_AGE_DAYS) return null
  const same = peers
    .filter(
      (p) =>
        p.publicationId !== target.publicationId && p.cumulative.length > age
    )
    .map((p) => p.cumulative[age]!)
  if (same.length < MIN_PEERS) return null
  const mid = median(same)
  return mid > 0 ? target.cumulative[age]! / mid : null
}

export function medianCurve(curves: readonly number[][]): (number | null)[] {
  const length = Math.max(0, ...curves.map((c) => c.length))
  return Array.from({ length }, (_, d) => {
    const values = curves.filter((c) => c.length > d).map((c) => c[d]!)
    return values.length >= MIN_PEERS ? median(values) : null
  })
}

export type PeriodWindow = {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export function periodWindow(
  period: AnalyticsPeriod,
  through: string
): PeriodWindow {
  const from = addDays(through, 1 - period)
  return {
    from,
    to: through,
    previousFrom: addDays(from, -period),
    previousTo: addDays(from, -1),
  }
}

export type PeriodTotals = {
  views: number
  watchHours: number
  netSubscribers: number
  averageViewDurationS: number | null
  likes: number
}

function totals(
  days: readonly ChannelDay[],
  from: string,
  to: string
): PeriodTotals {
  let views = 0
  let minutes = 0
  let net = 0
  let likes = 0
  let weighted = 0
  for (const d of days) {
    if (d.day < from || d.day > to) continue
    views += d.views
    minutes += d.estimatedMinutesWatched
    net += d.subscribersGained - d.subscribersLost
    likes += d.likes
    weighted += (d.averageViewDurationS ?? 0) * d.views
  }
  return {
    views,
    watchHours: minutes / 60,
    netSubscribers: net,
    averageViewDurationS: views > 0 ? weighted / views : null,
    likes,
  }
}

function change(current: number | null, previous: number | null) {
  return current === null || previous === null || previous <= 0
    ? null
    : (current - previous) / previous
}

export function periodSummary(
  days: readonly ChannelDay[],
  window: PeriodWindow
): {
  current: PeriodTotals
  previous: PeriodTotals
  change: Record<keyof PeriodTotals, number | null>
} {
  const current = totals(days, window.from, window.to)
  const previous = totals(days, window.previousFrom, window.previousTo)
  return {
    current,
    previous,
    change: {
      views: change(current.views, previous.views),
      watchHours: change(current.watchHours, previous.watchHours),
      netSubscribers: change(current.netSubscribers, previous.netSubscribers),
      averageViewDurationS: change(
        current.averageViewDurationS,
        previous.averageViewDurationS
      ),
      likes: change(current.likes, previous.likes),
    },
  }
}

export type DailyPoint = { day: string } & Record<ChannelContentType, number>

export function dailySeries(
  days: readonly ChannelDay[],
  from: string,
  to: string
): DailyPoint[] {
  const points = new Map<string, DailyPoint>()
  for (let d = from; d <= to; d = addDays(d, 1)) {
    points.set(d, { day: d, shorts: 0, long: 0, other: 0 })
  }
  for (const row of days) {
    const point = points.get(row.day)
    if (point) point[row.contentType] += row.views
  }
  return [...points.values()]
}
