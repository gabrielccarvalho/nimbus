import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Project defaults" }

export default async function SettingsPage() {
  const { settings, claudeAvailable, hardwareEncoder, englishOnlyModel } =
    await getSettingsPage()
  return (
    <SettingsForm
      initial={settings}
      claudeAvailable={claudeAvailable}
      hardwareEncoder={hardwareEncoder}
      englishOnlyModel={englishOnlyModel}
    />
  )
}
