import type { TimeRange } from "../analysis/schema"
import type { CaptionWord } from "../captions/pages"

export const EDIT_MIN_SILENCE_MS = 1000
export const EDIT_PADDING_MS = 150

export function keepRanges(
  silences: readonly TimeRange[],
  durationMs: number,
  {
    minSilenceMs = EDIT_MIN_SILENCE_MS,
    paddingMs = EDIT_PADDING_MS,
  }: { minSilenceMs?: number; paddingMs?: number } = {}
): TimeRange[] {
  const cuts = silences
    .filter((s) => s.endMs - s.startMs > minSilenceMs)
    .map((s) => ({
      startMs: Math.max(0, s.startMs + paddingMs),
      endMs: Math.min(durationMs, s.endMs - paddingMs),
    }))
    .filter((c) => c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const keep: TimeRange[] = []
  let cursor = 0
  for (const cut of cuts) {
    if (cut.startMs > cursor) keep.push({ startMs: cursor, endMs: cut.startMs })
    cursor = Math.max(cursor, cut.endMs)
  }
  if (cursor < durationMs) keep.push({ startMs: cursor, endMs: durationMs })
  return keep.filter((r) => r.endMs - r.startMs >= 40)
}

export function editedDuration(keep: readonly TimeRange[]) {
  return keep.reduce((sum, r) => sum + r.endMs - r.startMs, 0)
}

export function remapToEdit(
  words: readonly CaptionWord[],
  keep: readonly TimeRange[]
): CaptionWord[] {
  const out: CaptionWord[] = []
  let offset = 0
  let r = 0
  for (const word of words) {
    while (r < keep.length && keep[r]!.endMs <= word.startMs) {
      offset += keep[r]!.endMs - keep[r]!.startMs
      r++
    }
    const range = keep[r]
    if (!range || word.startMs < range.startMs) continue
    const start = offset + word.startMs - range.startMs
    const end = offset + Math.min(word.endMs, range.endMs) - range.startMs
    out.push({ text: word.text, startMs: start, endMs: Math.max(start, end) })
  }
  return out
}
