import type { Metadata } from "next"

import { Landing } from "@/components/marketing/landing"
import { marketing } from "@/components/marketing/messages"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages(marketing)).meta
  return { title: { absolute: t.title }, description: t.description }
}

// Signed-out visitors see this at "/" (proxy.ts rewrites it), rendered per request in their language.
export default function WelcomePage() {
  return <Landing />
}
