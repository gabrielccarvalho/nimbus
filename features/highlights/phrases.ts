import en from "./phrases/en.json"
import es from "./phrases/es.json"
import pt from "./phrases/pt.json"

const LISTS: Record<string, readonly string[]> = { en, es, pt }

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
}

export function reactionPhrases(
  language: string,
  extra: readonly string[] = []
) {
  return [
    ...new Set([...(LISTS[language] ?? []), ...extra].map(normalizeText)),
  ].filter(Boolean)
}

export function countPhrases(text: string, phrases: readonly string[]) {
  const haystack = ` ${normalizeText(text)} `
  let hits = 0
  for (const phrase of phrases) {
    let from = 0
    for (;;) {
      const at = haystack.indexOf(` ${phrase} `, from)
      if (at === -1) break
      hits++
      from = at + phrase.length + 1
    }
  }
  return hits
}

const LAUGHTER =
  /^(?:(?:ha|ah){2,}h?|(?:he){2,}|(?:hi){2,}|k{3,}|(?:ja){2,}|(?:je){2,}|(?:rs){2,}|l+o+l+|lmao+|risos|laughs?|laughter|risas)$/

export function isLaughter(word: string) {
  return LAUGHTER.test(normalizeText(word).replace(/\s+/g, ""))
}

export function isExclamation(word: string) {
  return /[!¡]/.test(word)
}
