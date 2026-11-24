import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Rendering" }

export default async function RenderingPage() {
  return <SettingsForm section="rendering" {...await getSettingsPage()} />
}
