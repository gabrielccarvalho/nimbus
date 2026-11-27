import { defaultLocale, type Locale } from "@/lib/i18n/config"

import { settings } from "./messages"

const CODES = ["en", "pt", "es", "fr", "de", "it", "ja", "ko", "zh", "ru"]

const options = new Map<Locale, { value: string; label: string }[]>()

// A plain module: Server Components read it too (the landing page).
export function languageOptions(locale: Locale) {
  let list = options.get(locale)
  if (!list) {
    const names = new Intl.DisplayNames([locale], { type: "language" })
    list = [
      { value: "auto", label: settings[locale].fields.languageAuto },
      ...CODES.map((value) => {
        const name = names.of(value) ?? value
        return {
          value,
          label: name.charAt(0).toLocaleUpperCase(locale) + name.slice(1),
        }
      }),
    ]
    options.set(locale, list)
  }
  return list
}

export const LANGUAGES = languageOptions(defaultLocale)

export function languageLabel(code: string, locale: Locale = defaultLocale) {
  return (
    languageOptions(locale).find((l) => l.value === code)?.label ??
    code.toUpperCase()
  )
}
