import type { Rect } from "./schema"

export type GrayFrame = {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export type BorderCandidate = { rect: Rect; score: number }

const MIN_AREA = 0.02
const MAX_AREA = 0.35
const MIN_ASPECT = 0.75
const MAX_ASPECT = 2.4
const LINE_CANDIDATES = 20
const ENCLOSING_SLACK = 0.12

function staticEdges(frames: readonly GrayFrame[]) {
  const { width, height } = frames[0]!
  const size = width * height
  const tolerated = frames.length >= 6 ? 1 : 0
  const pick = (values: number[]) => values.sort((a, b) => a - b)[tolerated]!
  const horizontal = new Float32Array(size)
  const vertical = new Float32Array(size)
  const gy: number[] = []
  const gx: number[] = []
  for (let i = 0; i < size; i++) {
    const x = i % width
    gy.length = 0
    gx.length = 0
    for (const { data } of frames) {
      gy.push(i + width < size ? Math.abs(data[i + width]! - data[i]!) : 0)
      gx.push(x + 1 < width ? Math.abs(data[i + 1]! - data[i]!) : 0)
    }
    horizontal[i] = pick(gy)
    vertical[i] = pick(gx)
  }
  return { horizontal, vertical, width, height }
}

const ENCLOSING_TOLERANCE = 0.01

function encloses(outer: Rect, inner: Rect) {
  return (
    outer.x <= inner.x + ENCLOSING_TOLERANCE &&
    outer.y <= inner.y + ENCLOSING_TOLERANCE &&
    outer.x + outer.w >= inner.x + inner.w - ENCLOSING_TOLERANCE &&
    outer.y + outer.h >= inner.y + inner.h - ENCLOSING_TOLERANCE
  )
}

function longestRun(length: number, strong: (i: number) => boolean) {
  let best = 0
  let run = 0
  let gap = 0
  for (let i = 0; i < length; i++) {
    if (strong(i)) {
      run += 1 + gap
      gap = 0
    } else if (run > 0 && gap === 0) {
      gap = 1
    } else {
      run = 0
      gap = 0
    }
    best = Math.max(best, run)
  }
  return best
}

function topLines(profile: Float32Array, count: number, minGap: number) {
  const order = [...profile.keys()].sort((a, b) => profile[b]! - profile[a]!)
  const picked: number[] = []
  for (const index of order) {
    if (profile[index]! <= 0) break
    if (picked.every((p) => Math.abs(p - index) >= minGap)) picked.push(index)
    if (picked.length === count) break
  }
  return picked.sort((a, b) => a - b)
}

export function detectOverlayRect(
  frames: readonly GrayFrame[],
  threshold = 24
): BorderCandidate | null {
  if (frames.length === 0) return null
  const { horizontal, vertical, width, height } = staticEdges(frames)
  const strongH = (x: number, y: number) =>
    horizontal[y * width + x]! >= threshold
  const strongV = (x: number, y: number) =>
    vertical[y * width + x]! >= threshold

  const rowProfile = new Float32Array(height)
  const colProfile = new Float32Array(width)
  for (let y = 0; y < height; y++) {
    rowProfile[y] = longestRun(width, (x) => strongH(x, y))
  }
  for (let x = 0; x < width; x++) {
    colProfile[x] = longestRun(height, (y) => strongV(x, y))
  }
  const rows = topLines(rowProfile, LINE_CANDIDATES, 2)
  const cols = topLines(colProfile, LINE_CANDIDATES, 2)

  const candidates: Array<BorderCandidate & { pixelArea: number }> = []
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const top = rows[a]!
      const bottom = rows[b]!
      for (let c = 0; c < cols.length; c++) {
        for (let d = c + 1; d < cols.length; d++) {
          const left = cols[c]!
          const right = cols[d]!
          const w = right - left
          const h = bottom - top
          const area = (w * h) / (width * height)
          const aspect = w / h
          if (area < MIN_AREA || area > MAX_AREA) continue
          if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue
          let hits = 0
          for (let x = left; x <= right; x++) {
            if (strongH(x, top)) hits++
            if (strongH(x, bottom)) hits++
          }
          for (let y = top; y <= bottom; y++) {
            if (strongV(left, y)) hits++
            if (strongV(right, y)) hits++
          }
          candidates.push({
            rect: {
              x: (left + 1) / width,
              y: (top + 1) / height,
              w: w / width,
              h: h / height,
            },
            score: hits / (2 * (w + 1) + 2 * (h + 1)),
            pixelArea: w * h,
          })
        }
      }
    }
  }
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))
  const [winner] = candidates
    .filter(
      (c) =>
        c.score >= best.score - ENCLOSING_SLACK && encloses(c.rect, best.rect)
    )
    .sort((a, b) => b.pixelArea - a.pixelArea)
  return { rect: winner!.rect, score: Math.round(winner!.score * 100) / 100 }
}
