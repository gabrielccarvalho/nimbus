"use client"

import * as React from "react"

import { defaultLocale, type Locale } from "./config"
import type { Dictionary } from "./messages"

const LocaleContext = React.createContext<Locale>(defaultLocale)

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

export function useLocale() {
  return React.useContext(LocaleContext)
}

export function useMessages<T>(dictionary: Dictionary<T>) {
  return dictionary[useLocale()]
}
