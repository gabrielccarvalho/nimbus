import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Project defaults" }

export default async function ProjectdefaultsPage() {
  return <SettingsForm section="defaults" {...await getSettingsPage()} />
}
