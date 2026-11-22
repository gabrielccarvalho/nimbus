import type { TimeRange } from "./schema"

export const SILENCE_NOISE_DB = -35
export const SILENCE_MIN_MS = 500

const START = /silence_start:\s*(-?[\d.]+)/
const END = /silence_end:\s*(-?[\d.]+)/

const toMs = (seconds: string) =>
  Math.max(0, Math.round(Number(seconds) * 1000))

export function createSilenceParser() {
  const ranges: TimeRange[] = []
  let openStart: number | null = null

  return {
    push(line: string) {
      const start = START.exec(line)
      if (start) {
        openStart = toMs(start[1]!)
        return
      }
      const end = END.exec(line)
      if (end && openStart !== null) {
        const endMs = toMs(end[1]!)
        if (endMs > openStart) ranges.push({ startMs: openStart, endMs })
        openStart = null
      }
    },
    finish(durationMs: number): TimeRange[] {
      if (openStart !== null && durationMs > openStart) {
        ranges.push({ startMs: openStart, endMs: durationMs })
      }
      openStart = null
      return ranges
        .map((r) => ({
          startMs: r.startMs,
          endMs: Math.min(r.endMs, durationMs),
        }))
        .filter((r) => r.endMs > r.startMs)
        .sort((a, b) => a.startMs - b.startMs)
    },
  }
}
