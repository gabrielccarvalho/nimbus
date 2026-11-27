import "server-only"

import { defaultLocale, type Locale } from "./config"
import { translateError } from "./errors"
import { getLocale } from "./server"

export async function translateRequestError(message: string) {
  let locale: Locale = defaultLocale
  try {
    locale = await getLocale()
  } catch {
    // Outside a request there is no locale to read; the error itself must still get through.
  }
  return translateError(message, locale)
}
