import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Captions" }

export default async function CaptionsPage() {
  return <SettingsForm section="captions" {...await getSettingsPage()} />
}
