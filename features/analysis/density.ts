import type { Word } from "../transcription/schema"
import type { DensityWindow } from "./schema"

export const DENSITY_WINDOW_MS = 10_000
export const DENSITY_STEP_MS = 5_000

export function computeSpeechDensity(
  words: readonly Pick<Word, "startMs" | "endMs">[],
  durationMs: number,
  windowMs = DENSITY_WINDOW_MS,
  stepMs = DENSITY_STEP_MS
): DensityWindow[] {
  if (durationMs <= 0) return []
  const windows: DensityWindow[] = []
  let first = 0
  for (let startMs = 0; startMs < durationMs; startMs += stepMs) {
    const endMs = Math.min(durationMs, startMs + windowMs)
    while (first < words.length && words[first]!.startMs < startMs) first++
    let count = 0
    for (let i = first; i < words.length && words[i]!.startMs < endMs; i++) {
      count++
    }
    windows.push({
      startMs,
      endMs,
      wordsPerSecond:
        Math.round((count / ((endMs - startMs) / 1000)) * 100) / 100,
    })
    if (endMs === durationMs) break
  }
  return windows
}
