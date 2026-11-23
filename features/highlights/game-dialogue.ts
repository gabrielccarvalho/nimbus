import type { TimeRange } from "../analysis/schema"
import { functionWordHits } from "../captions/speaker"
import type { Word } from "../transcription/schema"

const BIN_MS = 5000
const MIN_FOREIGN_PER_BIN = 2
const MAX_GAP_BINS = 1
export const MIN_STRETCH_MS = 20_000

// Stretches where the transcript is mostly in another language than the
// streamer's: game characters talking, usually a cutscene. Detection relies on
// the two languages differing, so a game voiced in the streamer's language
// yields nothing.
export function gameDialogueStretches(
  words: readonly Word[],
  language: string
): TimeRange[] {
  const bins = new Map<number, { main: number; foreign: number }>()
  for (const word of words) {
    const hits = functionWordHits(word.text, language)
    if (hits.main === 0 && hits.foreign === 0) continue
    const bin = Math.floor(word.startMs / BIN_MS)
    const counts = bins.get(bin) ?? { main: 0, foreign: 0 }
    counts.main += hits.main
    counts.foreign += hits.foreign
    bins.set(bin, counts)
  }
  const game = [...bins]
    .filter(([, c]) => c.foreign >= MIN_FOREIGN_PER_BIN && c.foreign > c.main)
    .map(([bin]) => bin)
    .sort((a, b) => a - b)

  const stretches: TimeRange[] = []
  let first = game[0]
  for (let i = 0; i < game.length; i++) {
    const bin = game[i]!
    const next = game[i + 1]
    if (next !== undefined && next - bin <= MAX_GAP_BINS + 1) continue
    const range = { startMs: first! * BIN_MS, endMs: (bin + 1) * BIN_MS }
    if (range.endMs - range.startMs >= MIN_STRETCH_MS) stretches.push(range)
    first = next
  }
  return stretches
}

export function coveredShare(
  range: TimeRange,
  stretches: readonly TimeRange[]
) {
  const length = range.endMs - range.startMs
  if (length <= 0) return 0
  let covered = 0
  for (const s of stretches) {
    covered += Math.max(
      0,
      Math.min(range.endMs, s.endMs) - Math.max(range.startMs, s.startMs)
    )
  }
  return Math.min(1, covered / length)
}
