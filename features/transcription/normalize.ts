import type { Segment, Word } from "./schema"

export type RawToken = {
  text: string
  startMs: number
  endMs: number
  confidence?: number
}

const PUNCTUATION_ONLY = /^[\p{P}\p{S}]+$/u
const SENTENCE_END = /[.?!…]["')\]]*$/
export const SEGMENT_GAP_MS = 1000

const clamp01 = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0

export function normalizeWords(tokens: readonly RawToken[]): Word[] {
  const sorted = tokens
    .filter((t) => Number.isFinite(t.startMs) && Number.isFinite(t.endMs))
    .map((t, index) => ({ ...t, index }))
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index)

  const merged: Array<Word & { parts: number; confidenceSum: number }> = []
  for (const token of sorted) {
    const startsWord = /^\s/.test(token.text)
    const text = token.text.trim()
    if (!text) continue
    const startMs = Math.max(0, Math.round(token.startMs))
    const endMs = Math.max(startMs, Math.round(token.endMs))
    const confidence = clamp01(token.confidence ?? 1)
    const previous = merged.at(-1)
    const attach =
      previous &&
      (PUNCTUATION_ONLY.test(text) || (!startsWord && merged.length > 0))
    if (previous && attach) {
      previous.text += text
      previous.endMs = Math.max(previous.endMs, endMs)
      previous.parts += 1
      previous.confidenceSum += confidence
      previous.confidence = previous.confidenceSum / previous.parts
      continue
    }
    merged.push({
      text,
      startMs,
      endMs,
      confidence,
      parts: 1,
      confidenceSum: confidence,
    })
  }

  const words: Word[] = merged.map(({ text, startMs, endMs, confidence }) => ({
    text,
    startMs,
    endMs,
    confidence: Math.round(confidence * 1000) / 1000,
  }))
  for (let i = 1; i < words.length; i++) {
    const previous = words[i - 1]!
    const current = words[i]!
    if (current.startMs < previous.endMs) {
      previous.endMs = Math.max(previous.startMs, current.startMs)
    }
  }
  return words
}

export function buildSegments(
  words: readonly Word[],
  gapMs = SEGMENT_GAP_MS
): Segment[] {
  const segments: Segment[] = []
  let first = 0
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const next = words[i + 1]
    const endsSentence = SENTENCE_END.test(word.text)
    const gapAfter = next ? next.startMs - word.endMs >= gapMs : true
    if (endsSentence || gapAfter) {
      const slice = words.slice(first, i + 1)
      segments.push({
        text: slice.map((w) => w.text).join(" "),
        startMs: slice[0]!.startMs,
        endMs: word.endMs,
        firstWord: first,
        lastWord: i,
      })
      first = i + 1
    }
  }
  return segments
}
