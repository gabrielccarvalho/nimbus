import type { Metadata } from "next"

import { Page } from "@/components/app-shell/page"
import { SettingsForm } from "@/components/settings/settings-form"
import { getSettingsPage } from "@/features/settings/queries"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const { settings, claudeAvailable, hardwareEncoder, englishOnlyModel } =
    await getSettingsPage()
  return (
    <Page className="max-w-[880px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[32px] leading-[1.1]">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Defaults for new projects. Each project can change its own from
          Project settings in its ⋯ menu.
        </p>
      </div>
      <SettingsForm
        initial={settings}
        claudeAvailable={claudeAvailable}
        hardwareEncoder={hardwareEncoder}
        englishOnlyModel={englishOnlyModel}
      />
    </Page>
  )
}
