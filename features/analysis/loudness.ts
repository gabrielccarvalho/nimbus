import { LOUDNESS_FLOOR_LUFS } from "./schema"

export const LOUDNESS_INTERVAL_MS = 250

const LINE = /\bt:\s*([\d.]+)\s.*?\bM:\s*(-?inf|nan|-?[\d.]+)/i

export function createLoudnessCollector(intervalMs = LOUDNESS_INTERVAL_MS) {
  const buckets: number[] = []

  return {
    push(line: string) {
      const match = LINE.exec(line)
      if (!match) return
      const ms = Number(match[1]) * 1000
      const value = Number(match[2])
      if (!Number.isFinite(ms)) return
      const lufs = Number.isFinite(value)
        ? Math.max(LOUDNESS_FLOOR_LUFS, value)
        : LOUDNESS_FLOOR_LUFS
      const index = Math.floor(ms / intervalMs)
      buckets[index] = Math.max(buckets[index] ?? LOUDNESS_FLOOR_LUFS, lufs)
    },
    finish(durationMs: number): number[] {
      const length = Math.max(0, Math.ceil(durationMs / intervalMs))
      return Array.from(
        { length },
        (_, i) => Math.round((buckets[i] ?? LOUDNESS_FLOOR_LUFS) * 10) / 10
      )
    },
  }
}

export function normalizeLoudness(values: readonly number[]): number[] {
  const audible = values.filter((v) => v > LOUDNESS_FLOOR_LUFS)
  if (audible.length === 0) return values.map(() => 0)
  const max = Math.max(...audible)
  const min = Math.min(...audible)
  const span = max - min
  return values.map((v) => {
    if (v <= LOUDNESS_FLOOR_LUFS) return 0
    return span === 0 ? 1 : Math.min(1, Math.max(0, (v - min) / span))
  })
}
