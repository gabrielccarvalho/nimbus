import type { Metadata } from "next"

import { settings } from "@/components/settings/messages"
import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.captions }
}

export default async function CaptionsPage() {
  return <SettingsForm section="captions" {...await getSettingsPage()} />
}
