import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const { settings, claudeAvailable, hardwareEncoder, englishOnlyModel } =
    await getSettingsPage()
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Transcription, highlight selection, captions and rendering.
        </p>
      </div>
      <SettingsForm
        initial={settings}
        claudeAvailable={claudeAvailable}
        hardwareEncoder={hardwareEncoder}
        englishOnlyModel={englishOnlyModel}
      />
    </div>
  )
}
