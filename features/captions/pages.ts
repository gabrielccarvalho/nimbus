import type { Word } from "../transcription/schema"

export type CaptionWord = { text: string; startMs: number; endMs: number }

export type CaptionPage = {
  index: number
  startMs: number
  endMs: number
  words: CaptionWord[]
  lines: number[]
}

export type PagingOptions = {
  maxWordsPerPage: number
  maxCharsPerLine: number
  maxLines: number
  gapMs: number
  holdMs: number
  wordBaseMs: number
  wordCharMs: number
  wordMaxMs: number
}

export const DEFAULT_PAGING: PagingOptions = {
  maxWordsPerPage: 4,
  maxCharsPerLine: 28,
  maxLines: 2,
  gapMs: 500,
  holdMs: 300,
  wordBaseMs: 300,
  wordCharMs: 80,
  wordMaxMs: 1_200,
}

const SENTENCE_END = /[.!?…]["')\]]*$/

export function breakLines(
  words: readonly string[],
  maxChars: number,
  maxLines: number
): number[] | null {
  if (words.length === 0) return []
  const width = (from: number, to: number) =>
    words.slice(from, to).join(" ").length
  if (width(0, words.length) <= maxChars || words.length === 1) {
    return [words.length]
  }
  if (maxLines < 2) return null
  let best: number[] | null = null
  let bestWidth = Infinity
  for (let split = 1; split < words.length; split++) {
    const first = width(0, split)
    const rest = width(split, words.length)
    const firstFits = first <= maxChars || split === 1
    if (!firstFits) break
    const tail = breakLines(words.slice(split), maxChars, maxLines - 1)
    if (!tail) continue
    const widest = Math.max(
      first,
      ...tail.map((count, i) => {
        const start = split + tail.slice(0, i).reduce((a, b) => a + b, 0)
        return width(start, start + count)
      })
    )
    if (widest < bestWidth || (widest === bestWidth && rest < first)) {
      best = [split, ...tail]
      bestWidth = widest
    }
  }
  return best
}

export function wordsInRange(
  words: readonly Word[],
  startMs: number,
  endMs: number
): CaptionWord[] {
  return words
    .filter((w) => w.startMs >= startMs - 50 && w.startMs < endMs)
    .map((w) => ({
      text: w.text,
      startMs: Math.max(0, w.startMs - startMs),
      endMs: Math.min(endMs - startMs, Math.max(w.startMs, w.endMs) - startMs),
    }))
}

// Whisper often stretches a word's end across the pause after it, which keeps
// captions on screen through silences.
export function spokenEnd(
  word: CaptionWord,
  opts: Pick<PagingOptions, "wordBaseMs" | "wordCharMs" | "wordMaxMs">
) {
  const expected = Math.min(
    opts.wordMaxMs,
    opts.wordBaseMs + opts.wordCharMs * word.text.length
  )
  return Math.max(word.startMs, Math.min(word.endMs, word.startMs + expected))
}

export function buildCaptionPages(
  input: readonly CaptionWord[],
  durationMs: number,
  options: Partial<PagingOptions> = {}
): CaptionPage[] {
  const opts = { ...DEFAULT_PAGING, ...options }
  const words = input.map((word) => ({ ...word, endMs: spokenEnd(word, opts) }))
  const groups: CaptionWord[][] = []
  let current: CaptionWord[] = []
  for (const word of words) {
    const previous = current.at(-1)
    const candidate = [...current, word]
    const breakBefore =
      previous !== undefined &&
      (word.startMs - previous.endMs > opts.gapMs ||
        SENTENCE_END.test(previous.text) ||
        current.length >= opts.maxWordsPerPage ||
        !breakLines(
          candidate.map((w) => w.text),
          opts.maxCharsPerLine,
          opts.maxLines
        ))
    if (breakBefore) {
      groups.push(current)
      current = [word]
    } else {
      current = candidate
    }
  }
  if (current.length) groups.push(current)

  return groups.map((group, index) => {
    const next = groups[index + 1]?.[0]
    const last = group.at(-1)!
    const endMs = Math.min(
      durationMs,
      next ? next.startMs : Infinity,
      Math.max(last.endMs, group[0]!.startMs + 1) + opts.holdMs
    )
    return {
      index,
      startMs: group[0]!.startMs,
      endMs: Math.max(endMs, last.endMs),
      words: group,
      lines: breakLines(
        group.map((w) => w.text),
        opts.maxCharsPerLine,
        opts.maxLines
      ) ?? [group.length],
    }
  })
}

export type PageOverride = {
  index: number
  text?: string
  startMs?: number
  endMs?: number
}

export type CaptionEdits = {
  pages?: readonly PageOverride[]
  offsetMs?: number
}

function retimePage(page: CaptionPage, startMs: number, endMs: number) {
  const from = page.endMs - page.startMs
  const scale = from > 0 ? (endMs - startMs) / from : 0
  const at = (ms: number) => Math.round(startMs + (ms - page.startMs) * scale)
  return {
    ...page,
    startMs,
    endMs,
    words: page.words.map((w) => ({
      ...w,
      startMs: at(w.startMs),
      endMs: at(w.endMs),
    })),
  }
}

export function applyPageOverrides(
  pages: readonly CaptionPage[],
  overrides: readonly PageOverride[],
  options: Pick<PagingOptions, "maxCharsPerLine" | "maxLines"> = DEFAULT_PAGING
): CaptionPage[] {
  const byIndex = new Map(overrides.map((o) => [o.index, o]))
  return pages.flatMap((page) => {
    const override = byIndex.get(page.index)
    if (!override) return [page]
    let edited = page
    if (override.text !== undefined) {
      const tokens = override.text.split(/\s+/).filter(Boolean)
      if (tokens.length === 0) return []
      const span = (page.words.at(-1)!.endMs - page.startMs) / tokens.length
      edited = {
        ...page,
        words: tokens.map((token, i) => ({
          text: token,
          startMs: Math.round(page.startMs + i * span),
          endMs: Math.round(page.startMs + (i + 1) * span),
        })),
        lines: breakLines(
          tokens,
          options.maxCharsPerLine,
          options.maxLines
        ) ?? [tokens.length],
      }
    }
    const startMs = override.startMs ?? page.startMs
    const endMs = override.endMs ?? page.endMs
    if (endMs <= startMs) return [edited]
    return [retimePage(edited, startMs, endMs)]
  })
}

export function shiftPages(
  pages: readonly CaptionPage[],
  offsetMs: number,
  durationMs: number
): CaptionPage[] {
  if (offsetMs === 0) return [...pages]
  const shift = (ms: number) => Math.min(durationMs, Math.max(0, ms + offsetMs))
  return pages.flatMap((page) => {
    if (page.endMs + offsetMs <= 0 || page.startMs + offsetMs >= durationMs) {
      return []
    }
    return [
      {
        ...page,
        startMs: shift(page.startMs),
        endMs: shift(page.endMs),
        words: page.words.map((w) => ({
          ...w,
          startMs: shift(w.startMs),
          endMs: shift(w.endMs),
        })),
      },
    ]
  })
}

export function editCaptionPages(
  pages: readonly CaptionPage[],
  edits: CaptionEdits | null | undefined,
  durationMs: number,
  options: Pick<PagingOptions, "maxCharsPerLine" | "maxLines"> = DEFAULT_PAGING
): CaptionPage[] {
  return shiftPages(
    applyPageOverrides(pages, edits?.pages ?? [], options),
    edits?.offsetMs ?? 0,
    durationMs
  )
}

export function pageRoom(
  pages: readonly CaptionPage[],
  index: number,
  durationMs: number
): { minMs: number; maxMs: number } {
  const at = pages.findIndex((page) => page.index === index)
  return {
    minMs: pages[at - 1]?.endMs ?? 0,
    maxMs: pages[at + 1]?.startMs ?? durationMs,
  }
}

export function pageAt(pages: readonly CaptionPage[], ms: number) {
  return pages.find((page) => ms >= page.startMs && ms < page.endMs)
}

export function activeWordIndex(page: CaptionPage, ms: number) {
  let active = -1
  for (let i = 0; i < page.words.length; i++) {
    if (page.words[i]!.startMs <= ms) active = i
  }
  return active
}

export function sampleCaptionWords(
  words: readonly Word[],
  count = 8,
  gapMs = DEFAULT_PAGING.gapMs
): CaptionWord[] {
  const from = Math.floor(words.length / 10)
  for (let i = from; i + count <= words.length; i++) {
    const run = words.slice(i, i + count)
    if (
      run.every((w, j) => j === 0 || w.startMs - run[j - 1]!.endMs <= gapMs)
    ) {
      return wordsInRange(run, run[0]!.startMs, run.at(-1)!.endMs + 1)
    }
  }
  return []
}

export function clipCaptionsEnabled(
  clip: { captionOverrides?: { enabled?: boolean } | null },
  settings: { captionsEnabled: boolean }
): boolean {
  return clip.captionOverrides?.enabled ?? settings.captionsEnabled
}

export function clipCaptionPages(
  words: readonly Word[],
  clip: {
    startMs: number
    endMs: number
    captionOverrides?: CaptionEdits | null
  },
  style: Pick<PagingOptions, "maxWordsPerPage" | "maxCharsPerLine">
): CaptionPage[] {
  const durationMs = clip.endMs - clip.startMs
  return editCaptionPages(
    buildCaptionPages(
      wordsInRange(words, clip.startMs, clip.endMs),
      durationMs,
      {
        maxWordsPerPage: style.maxWordsPerPage,
        maxCharsPerLine: style.maxCharsPerLine,
      }
    ),
    clip.captionOverrides,
    durationMs,
    { maxCharsPerLine: style.maxCharsPerLine, maxLines: 2 }
  )
}
