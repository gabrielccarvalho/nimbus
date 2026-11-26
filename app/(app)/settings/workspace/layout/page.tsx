import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Layout" }

export default async function LayoutPage() {
  return <SettingsForm section="layout" {...await getSettingsPage()} />
}
