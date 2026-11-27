import type { TimeRange } from "../analysis/schema"

export const CLIP_PART_MIN_MS = 1000
export const CLIP_MAX_PARTS = 12

export type Parted = TimeRange & { parts?: readonly TimeRange[] | null }

type Timed = { startMs: number; endMs: number }

const length = (range: TimeRange) => range.endMs - range.startMs

// A clip's own timeline starts at its first part's place in the recording and
// runs through its parts back to back, so a one-part clip's timeline is the
// recording's.
export function clipParts(clip: Parted): readonly TimeRange[] {
  return clip.parts?.length
    ? clip.parts
    : [{ startMs: clip.startMs, endMs: clip.endMs }]
}

export function partsDuration(parts: readonly TimeRange[]) {
  return parts.reduce((sum, part) => sum + length(part), 0)
}

export function partsRange(parts: readonly TimeRange[]): TimeRange {
  const startMs = parts[0]?.startMs ?? 0
  return { startMs, endMs: startMs + partsDuration(parts) }
}

export function storedParts(parts: readonly TimeRange[]) {
  return {
    ...partsRange(parts),
    parts: parts.length > 1 ? parts.map((part) => ({ ...part })) : null,
  }
}

export function partStarts(parts: readonly TimeRange[]) {
  const starts: number[] = []
  let cursor = parts[0]?.startMs ?? 0
  for (const part of parts) {
    starts.push(cursor)
    cursor += length(part)
  }
  return starts
}

export function partIndexAt(parts: readonly TimeRange[], ms: number) {
  const starts = partStarts(parts)
  let index = 0
  for (let i = 1; i < parts.length; i++) if (ms >= starts[i]!) index = i
  return index
}

// Before the first part and after the last one the timeline keeps following
// the recording, which is what lets the clip's ends be dragged outwards.
export function toSourceMs(parts: readonly TimeRange[], ms: number) {
  const index = partIndexAt(parts, ms)
  const part = parts[index]
  return part ? part.startMs + ms - partStarts(parts)[index]! : ms
}

export function toTimelineMs(parts: readonly TimeRange[], sourceMs: number) {
  const starts = partStarts(parts)
  const index = parts.findIndex(
    (part) => sourceMs >= part.startMs && sourceMs < part.endMs
  )
  return index === -1 ? null : starts[index]! + sourceMs - parts[index]!.startMs
}

export function sourceRanges(
  parts: readonly TimeRange[],
  range: TimeRange
): TimeRange[] {
  const starts = partStarts(parts)
  const last = parts.length - 1
  return parts.flatMap((part, i) => {
    const from = i === 0 ? -Infinity : starts[i]!
    const to = i === last ? Infinity : starts[i]! + length(part)
    const startMs = Math.max(range.startMs, from)
    const endMs = Math.min(range.endMs, to)
    if (endMs <= startMs) return []
    const shift = part.startMs - starts[i]!
    return [{ startMs: startMs + shift, endMs: endMs + shift }]
  })
}

export function timelineItems<T extends Timed>(
  items: readonly T[],
  parts: readonly TimeRange[],
  padMs = 0
): T[] {
  if (parts.length < 2) return [...items]
  const starts = partStarts(parts)
  const last = parts.length - 1
  return parts.flatMap((part, i) => {
    const from = part.startMs - (i === 0 ? padMs : 0)
    const to = part.endMs + (i === last ? padMs : 0)
    const shift = starts[i]! - part.startMs
    return items
      .filter((item) => item.startMs >= from && item.startMs < to)
      .map((item) => ({
        ...item,
        startMs: item.startMs + shift,
        endMs: Math.min(Math.max(item.startMs, item.endMs), to) + shift,
      }))
  })
}

export function timelinePoints<T extends { ms: number }>(
  points: readonly T[],
  parts: readonly TimeRange[]
): T[] {
  return points.flatMap((point) => {
    const ms = toTimelineMs(parts, point.ms)
    return ms === null ? [] : [{ ...point, ms }]
  })
}

// The clip's two ends are the first part's start and the last part's end.
// Neither may run into another part or out of the recording.
export function resizeParts(
  parts: readonly TimeRange[],
  range: TimeRange,
  durationMs = Infinity
): TimeRange[] {
  const current = partsRange(parts)
  const next = parts.map((part) => ({ ...part }))
  const first = next[0]
  const last = next.at(-1)
  if (!first || !last) return next
  const floor = Math.max(
    0,
    ...parts.filter((p) => p.endMs <= parts[0]!.startMs).map((p) => p.endMs)
  )
  const lastEnd = parts.at(-1)!.endMs
  const ceiling = Math.min(
    durationMs,
    ...parts.filter((p) => p.startMs >= lastEnd).map((p) => p.startMs)
  )
  first.startMs = Math.max(
    floor,
    Math.min(Math.round(range.startMs), first.endMs - CLIP_PART_MIN_MS)
  )
  last.endMs = Math.min(
    ceiling,
    Math.max(
      last.endMs + Math.round(range.endMs) - current.endMs,
      last.startMs + CLIP_PART_MIN_MS
    )
  )
  return next
}

// Moves one part's own edges in the recording; a negative startDelta shows
// more of what came before it.
export function trimPart(
  parts: readonly TimeRange[],
  index: number,
  startDelta: number,
  endDelta: number,
  durationMs = Infinity
): TimeRange[] {
  const part = parts[index]
  if (!part) return [...parts]
  const others = parts.filter((_, i) => i !== index)
  const floor = Math.max(
    0,
    ...others.filter((p) => p.endMs <= part.startMs).map((p) => p.endMs)
  )
  const ceiling = Math.min(
    durationMs,
    ...others.filter((p) => p.startMs >= part.endMs).map((p) => p.startMs)
  )
  const endMs = Math.min(
    ceiling,
    Math.max(part.endMs + Math.round(endDelta), part.startMs + CLIP_PART_MIN_MS)
  )
  const startMs = Math.max(
    floor,
    Math.min(part.startMs + Math.round(startDelta), endMs - CLIP_PART_MIN_MS)
  )
  return parts.map((p, i) => (i === index ? { startMs, endMs } : { ...p }))
}

export function splitPartAt(
  parts: readonly TimeRange[],
  ms: number
): TimeRange[] | undefined {
  const index = partIndexAt(parts, ms)
  const part = parts[index]
  if (!part) return undefined
  const at = Math.round(toSourceMs(parts, ms))
  if (
    at - part.startMs < CLIP_PART_MIN_MS ||
    part.endMs - at < CLIP_PART_MIN_MS
  )
    return undefined
  return [
    ...parts.slice(0, index),
    { startMs: part.startMs, endMs: at },
    { startMs: at, endMs: part.endMs },
    ...parts.slice(index + 1),
  ]
}

export function movePart(
  parts: readonly TimeRange[],
  from: number,
  to: number
): TimeRange[] {
  const next = [...parts]
  const [part] = next.splice(from, 1)
  if (!part || to < 0 || to > next.length) return [...parts]
  next.splice(to, 0, part)
  return next
}

// Two neighbours that continue each other in the recording are one part.
export function mergeParts(
  parts: readonly TimeRange[],
  gapMs = 0
): TimeRange[] {
  const merged: TimeRange[] = []
  for (const part of parts) {
    const previous = merged.at(-1)
    const gap = previous ? part.startMs - previous.endMs : -1
    if (previous && gap >= 0 && gap <= gapMs) previous.endMs = part.endMs
    else merged.push({ ...part })
  }
  return merged
}

export function partsOverlap(parts: readonly TimeRange[]) {
  const sorted = [...parts].sort((a, b) => a.startMs - b.startMs)
  return sorted.some((part, i) => i > 0 && part.startMs < sorted[i - 1]!.endMs)
}

export function partsProblem(
  parts: readonly TimeRange[],
  durationMs: number
): string | null {
  if (parts.length === 0) return "The clip needs at least one part"
  if (parts.length > CLIP_MAX_PARTS) {
    return `A clip can have at most ${CLIP_MAX_PARTS} parts`
  }
  if (parts.some((part) => part.startMs < 0 || part.endMs > durationMs)) {
    return "The clip must stay inside the recording"
  }
  if (parts.some((part) => length(part) < CLIP_PART_MIN_MS)) {
    return `Each part must be at least ${CLIP_PART_MIN_MS / 1000} second long`
  }
  if (partsOverlap(parts)) return "Two parts of the clip overlap"
  return null
}

// Keeps things that sit on the timeline on the same moment of the recording
// when the parts under them change. What was on a removed stretch is dropped.
export function remapItems<T extends Timed>(
  items: readonly T[],
  before: readonly TimeRange[],
  after: readonly TimeRange[]
): T[] {
  const afterRange = partsRange(after)
  return items.flatMap((item) => {
    const startMs = toTimelineMs(after, toSourceMs(before, item.startMs))
    if (startMs === null) return []
    const endMs = Math.min(startMs + length(item), afterRange.endMs)
    return endMs > startMs ? [{ ...item, startMs, endMs }] : []
  })
}

export function overlapsParts(a: Parted, b: Parted) {
  return clipParts(a).some((x) =>
    clipParts(b).some((y) => x.startMs < y.endMs && y.startMs < x.endMs)
  )
}
