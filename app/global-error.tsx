"use client"

import "./globals.css"

import * as React from "react"

import { shell } from "@/components/app-shell/messages"
import { RouteError } from "@/components/app-shell/route-error"
import { LocaleProvider } from "@/lib/i18n/client"
import { defaultLocale, isLocale, matchLocale } from "@/lib/i18n/config"

const subscribe = () => () => {}

function browserLocale() {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : matchLocale(navigator.languages.join(","))
}

export default function GlobalError({ retry }: { retry: () => void }) {
  // This replaces the root layout, so there is no LocaleProvider above it.
  const locale = React.useSyncExternalStore(
    subscribe,
    browserLocale,
    () => defaultLocale
  )
  return (
    <html lang={locale}>
      <body className="grid min-h-svh place-items-center bg-background font-sans text-foreground antialiased">
        <title>{shell[locale].routeError.documentTitle}</title>
        <LocaleProvider locale={locale}>
          <RouteError retry={retry} />
        </LocaleProvider>
      </body>
    </html>
  )
}
