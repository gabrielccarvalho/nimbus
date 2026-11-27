import type { Locale } from "./config"

export type Dictionary<T> = Record<Locale, T>

// en-US sets the shape; every other locale has to match it.
export function defineMessages<T>(messages: {
  "en-US": T
  "pt-BR": NoInfer<T>
}): Dictionary<T> {
  return messages
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

export function plural(
  locale: Locale,
  count: number,
  forms: { one: string; other: string }
) {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules.select(count) === "one" ? forms.one : forms.other
}
