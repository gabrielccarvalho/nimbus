import type { LanguageSource } from "./schema"

export type LanguageVote = { language: string; probability: number }

const NOT_LANGUAGES = new Set(["und", "zxx", "mul", "mis"])

// Whisper's own language names, which its verbose_json responses use.
const WHISPER_LANGUAGES: Record<string, string> = {
  afrikaans: "af",
  albanian: "sq",
  amharic: "am",
  arabic: "ar",
  armenian: "hy",
  assamese: "as",
  azerbaijani: "az",
  bashkir: "ba",
  basque: "eu",
  belarusian: "be",
  bengali: "bn",
  bosnian: "bs",
  breton: "br",
  bulgarian: "bg",
  cantonese: "yue",
  catalan: "ca",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  faroese: "fo",
  finnish: "fi",
  french: "fr",
  galician: "gl",
  georgian: "ka",
  german: "de",
  greek: "el",
  gujarati: "gu",
  haitian: "ht",
  "haitian creole": "ht",
  hausa: "ha",
  hawaiian: "haw",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  icelandic: "is",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  javanese: "jw",
  kannada: "kn",
  kazakh: "kk",
  khmer: "km",
  korean: "ko",
  lao: "lo",
  latin: "la",
  latvian: "lv",
  lingala: "ln",
  lithuanian: "lt",
  luxembourgish: "lb",
  macedonian: "mk",
  malagasy: "mg",
  malay: "ms",
  malayalam: "ml",
  maltese: "mt",
  maori: "mi",
  marathi: "mr",
  mongolian: "mn",
  myanmar: "my",
  burmese: "my",
  nepali: "ne",
  norwegian: "no",
  nynorsk: "nn",
  occitan: "oc",
  pashto: "ps",
  persian: "fa",
  polish: "pl",
  portuguese: "pt",
  punjabi: "pa",
  romanian: "ro",
  russian: "ru",
  sanskrit: "sa",
  serbian: "sr",
  shona: "sn",
  sindhi: "sd",
  sinhala: "si",
  slovak: "sk",
  slovenian: "sl",
  somali: "so",
  spanish: "es",
  castilian: "es",
  sundanese: "su",
  swahili: "sw",
  swedish: "sv",
  tagalog: "tl",
  tajik: "tg",
  tamil: "ta",
  tatar: "tt",
  telugu: "te",
  thai: "th",
  tibetan: "bo",
  turkish: "tr",
  turkmen: "tk",
  ukrainian: "uk",
  urdu: "ur",
  uzbek: "uz",
  vietnamese: "vi",
  welsh: "cy",
  yiddish: "yi",
  yoruba: "yo",
}

export function normalizeLanguage(code: string | null | undefined) {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0] ?? ""
  if (!/^[a-z]{2,3}$/.test(primary) || NOT_LANGUAGES.has(primary)) return null
  return primary
}

export function whisperLanguageCode(value: string | null | undefined) {
  const name = value?.trim().toLowerCase() ?? ""
  return WHISPER_LANGUAGES[name] ?? normalizeLanguage(name)
}

export function detectionWindows(
  durationMs: number,
  { count = 7, windowMs = 30_000 } = {}
) {
  if (durationMs <= windowMs * 2) return [0]
  const span = durationMs - windowMs
  return Array.from({ length: count }, (_, i) =>
    Math.round((span * (i + 0.5)) / count)
  )
}

export function pickLanguage(votes: LanguageVote[]) {
  const totals = new Map<string, number>()
  for (const vote of votes) {
    totals.set(
      vote.language,
      (totals.get(vote.language) ?? 0) + vote.probability
    )
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null
  const [language, weight] = [...totals.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0]!
  return { language, confidence: weight / total }
}

export function resolveLanguage({
  setting,
  sourceLanguage,
}: {
  setting: string
  sourceLanguage: string | null
}): { language: string; source: LanguageSource } | null {
  const chosen = setting === "auto" ? null : normalizeLanguage(setting)
  if (chosen) return { language: chosen, source: "setting" }
  const hinted = normalizeLanguage(sourceLanguage)
  if (hinted) return { language: hinted, source: "source" }
  return null
}
