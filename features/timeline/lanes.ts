export type Span = { startMs: number; endMs: number }
export type Laned = Span & { lane: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function overlaps(a: Span, b: Span) {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

export function laneGap(
  items: readonly Laned[],
  lane: number,
  around: Span,
  bounds: Span,
  skip?: number
): Span | undefined {
  const others = items.filter((item, i) => i !== skip && item.lane === lane)
  const inside = around.endMs > around.startMs ? around : undefined
  if (
    others.some((o) =>
      inside
        ? overlaps(o, inside)
        : o.startMs <= around.startMs && around.startMs < o.endMs
    )
  ) {
    return undefined
  }
  return {
    startMs: Math.max(
      bounds.startMs,
      ...others.filter((o) => o.endMs <= around.startMs).map((o) => o.endMs)
    ),
    endMs: Math.min(
      bounds.endMs,
      ...others.filter((o) => o.startMs >= around.endMs).map((o) => o.startMs)
    ),
  }
}

export function fitInLane(
  items: readonly Laned[],
  index: number,
  lane: number,
  next: Span,
  bounds: Span,
  { moving, minMs }: { moving: boolean; minMs: number }
): Span | undefined {
  const current = items[index]!
  const anchor = lane === current.lane ? current : next
  const gap =
    laneGap(items, lane, anchor, bounds, index) ??
    (lane === current.lane
      ? undefined
      : laneGap(
          items,
          lane,
          {
            startMs: (next.startMs + next.endMs) / 2,
            endMs: (next.startMs + next.endMs) / 2,
          },
          bounds,
          index
        ))
  if (!gap) return undefined
  const length = next.endMs - next.startMs
  if (moving && gap.endMs - gap.startMs < length) return undefined
  const startMs = moving
    ? clamp(next.startMs, gap.startMs, gap.endMs - length)
    : Math.max(next.startMs, gap.startMs)
  const endMs = moving ? startMs + length : Math.min(next.endMs, gap.endMs)
  if (endMs - startMs < minMs) return undefined
  return { startMs, endMs }
}

export function placeInLane(
  items: readonly Laned[],
  lane: number,
  bounds: Span,
  atMs: number,
  lengthMs: number,
  minMs: number
): Span | undefined {
  const at = clamp(Math.round(atMs), bounds.startMs, bounds.endMs)
  const gap = laneGap(items, lane, { startMs: at, endMs: at }, bounds)
  if (!gap || gap.endMs - gap.startMs < minMs) return undefined
  const length = Math.min(lengthMs, gap.endMs - gap.startMs)
  const startMs = clamp(at, gap.startMs, gap.endMs - length)
  return { startMs, endMs: startMs + length }
}

export function firstFreeLane(
  items: readonly Laned[],
  span: Span,
  maxLanes: number,
  from = 0
): number | undefined {
  for (let lane = from; lane < maxLanes; lane++) {
    if (!items.some((item) => item.lane === lane && overlaps(item, span))) {
      return lane
    }
  }
  return undefined
}

export function placeAtPlayhead(
  items: readonly Laned[],
  bounds: Span,
  atMs: number,
  lengthMs: number,
  { minMs, maxLanes, lane }: { minMs: number; maxLanes: number; lane?: number }
): Laned | undefined {
  const lanes =
    lane === undefined ? Array.from({ length: maxLanes }, (_, i) => i) : [lane]
  for (const candidate of lanes) {
    const placed = placeInLane(items, candidate, bounds, atMs, lengthMs, minMs)
    if (placed) return { ...placed, lane: candidate }
  }
  return undefined
}

export function packLanes<T extends Span & { lane?: number }>(
  items: readonly T[],
  maxLanes: number
): (T & { lane: number })[] {
  const placed: (T & { lane: number })[] = []
  const sorted = [...items].sort(
    (a, b) =>
      (a.lane === undefined ? 1 : 0) - (b.lane === undefined ? 1 : 0) ||
      a.startMs - b.startMs
  )
  for (const item of sorted) {
    const wanted = item.lane ?? 0
    const lane =
      firstFreeLane(placed, item, maxLanes, wanted) ??
      firstFreeLane(placed, item, wanted)
    if (lane !== undefined) placed.push({ ...item, lane })
  }
  return placed.sort((a, b) => a.lane - b.lane || a.startMs - b.startMs)
}

export function laneCount(items: readonly { lane: number }[], minimum = 1) {
  return Math.max(minimum, ...items.map((item) => item.lane + 1))
}

export function moveItem<T extends Laned>(
  items: readonly T[],
  index: number,
  target: Laned,
  bounds: Span,
  minMs: number
): T[] | undefined {
  const current = items[index]
  if (!current) return undefined
  const moving =
    target.lane !== current.lane ||
    target.endMs - target.startMs === current.endMs - current.startMs
  const placed = fitInLane(items, index, target.lane, target, bounds, {
    moving,
    minMs,
  })
  if (!placed) return undefined
  return items.map((item, i) =>
    i === index ? { ...item, ...placed, lane: target.lane } : item
  )
}
