import type { Metadata } from "next"

import {
  DeleteAccount,
  SecuritySettingsView,
} from "@/components/settings/account-settings"
import { getSecuritySettings } from "@/features/accounts/queries"

export const metadata: Metadata = { title: "Sign-in & security" }

export default async function SecurityPage() {
  const data = await getSecuritySettings()
  return (
    <>
      <SecuritySettingsView data={data} />
      <DeleteAccount hasPassword={data.hasPassword} />
    </>
  )
}
