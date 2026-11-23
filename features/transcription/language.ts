import type { LanguageSource } from "./schema"

export type LanguageVote = { language: string; probability: number }

const DETECTED =
  /auto-detected language:\s*([a-z]{2,3})\s*\(p\s*=\s*([\d.]+)\)/i
const NOT_LANGUAGES = new Set(["und", "zxx", "mul", "mis"])

export function normalizeLanguage(code: string | null | undefined) {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0] ?? ""
  if (!/^[a-z]{2,3}$/.test(primary) || NOT_LANGUAGES.has(primary)) return null
  return primary
}

export function parseDetectedLanguage(output: string): LanguageVote | null {
  const match = DETECTED.exec(output)
  if (!match) return null
  const probability = Number(match[2])
  return {
    language: match[1]!.toLowerCase(),
    probability: Number.isFinite(probability) ? probability : 0,
  }
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

export function isEnglishOnlyModel(model: string) {
  return /\.en([-_.][\w.-]*)?\.bin$/.test(model)
}
