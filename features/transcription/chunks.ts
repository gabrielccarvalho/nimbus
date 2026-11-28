import type { RawToken } from "./normalize"

export const CHUNK_MS = 10 * 60_000
export const CHUNK_OVERLAP_MS = 5_000

export type AudioChunk = {
  startMs: number
  durationMs: number
  keepFromMs: number
  keepToMs: number
}

// Each chunk reaches a few seconds into its neighbours, so a word cut at a
// boundary is whole in one of them; only words starting in the chunk's own
// span are kept.
export function planChunks(
  durationMs: number,
  chunkMs = CHUNK_MS,
  overlapMs = CHUNK_OVERLAP_MS
): AudioChunk[] {
  const total = Math.max(0, Math.round(durationMs))
  const count = Math.max(1, Math.ceil(total / chunkMs))
  return Array.from({ length: count }, (_, i) => {
    const keepFromMs = i * chunkMs
    const last = i === count - 1
    const startMs = Math.max(0, keepFromMs - overlapMs)
    const endMs = last
      ? total
      : Math.min(total, keepFromMs + chunkMs + overlapMs)
    return {
      startMs,
      durationMs: Math.max(0, endMs - startMs),
      keepFromMs,
      keepToMs: last ? Number.POSITIVE_INFINITY : keepFromMs + chunkMs,
    }
  })
}

export function chunkTokens(chunk: AudioChunk, tokens: readonly RawToken[]) {
  return tokens
    .map((token) => ({
      ...token,
      startMs: token.startMs + chunk.startMs,
      endMs: token.endMs + chunk.startMs,
    }))
    .filter(
      (token) =>
        token.startMs >= chunk.keepFromMs && token.startMs < chunk.keepToMs
    )
}

const bare = (text: string) =>
  text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")

// The word list has no punctuation or casing; the segment text has both.
// Each segment word replaces the matching timed word, looking a few words
// ahead when the two lists drift apart.
export function punctuate(
  words: readonly { text: string; startMs: number; endMs: number }[],
  segmentTexts: readonly string[],
  lookahead = 3
): RawToken[] {
  const tokens: RawToken[] = words.map((word) => ({
    text: ` ${word.text.trim()}`,
    startMs: word.startMs,
    endMs: word.endMs,
  }))
  let next = 0
  for (const piece of segmentTexts.join(" ").split(/\s+/)) {
    const key = bare(piece)
    if (!key) continue
    for (let i = next; i < Math.min(tokens.length, next + lookahead + 1); i++) {
      if (bare(tokens[i]!.text) === key) {
        tokens[i]!.text = ` ${piece}`
        next = i + 1
        break
      }
    }
  }
  return tokens
}
