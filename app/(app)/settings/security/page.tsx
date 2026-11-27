import type { Metadata } from "next"

import {
  DeleteAccount,
  SecuritySettingsView,
} from "@/components/settings/account-settings"
import { settings } from "@/components/settings/messages"
import { getSecuritySettings } from "@/features/accounts/queries"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.security }
}

export default async function SecurityPage() {
  const data = await getSecuritySettings()
  return (
    <>
      <SecuritySettingsView data={data} />
      <DeleteAccount hasPassword={data.hasPassword} />
    </>
  )
}
