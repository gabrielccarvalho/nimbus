export const locales = ["en-US", "pt-BR"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "en-US"

export const LOCALE_COOKIE = "nimbus_locale"

export const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
} as const

export const localeNames: Record<Locale, string> = {
  "en-US": "English",
  "pt-BR": "Português",
}

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale)
}

// "pt-PT,pt;q=0.9,en;q=0.8" → "pt-BR": the first language we have, by q.
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";")
      const q = params.find((param) => param.trim().startsWith("q="))
      const weight = q ? Number(q.trim().slice(2)) : 1
      return { tag: tag.toLowerCase(), weight, index }
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  for (const { tag } of ranked) {
    const language = tag.split("-")[0]
    const match = locales.find(
      (locale) => locale.toLowerCase().split("-")[0] === language
    )
    if (match) return match
  }
  return defaultLocale
}
