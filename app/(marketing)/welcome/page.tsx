import type { Metadata } from "next"

import { Landing } from "@/components/marketing/landing"
import { marketing } from "@/components/marketing/messages"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { socialMetadata } from "@/lib/i18n/social-metadata"

export async function generateMetadata(): Promise<Metadata> {
  const [{ meta: t }, locale] = await Promise.all([
    getMessages(marketing),
    getLocale(),
  ])
  return {
    title: { absolute: t.title },
    description: t.description,
    ...socialMetadata(locale, t.title, t.description),
  }
}

// Signed-out visitors see this at "/" (proxy.ts rewrites it), rendered per request in their language.
export default function WelcomePage() {
  return <Landing />
}
