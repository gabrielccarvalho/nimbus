import "server-only"

import { cookies, headers } from "next/headers"
import { cache } from "react"

import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config"
import type { Dictionary } from "./messages"

// This browser's choice (set by the selector, or from the account at sign-in), then its language.
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  return matchLocale((await headers()).get("accept-language"))
})

export async function getMessages<T>(dictionary: Dictionary<T>) {
  return dictionary[await getLocale()]
}
