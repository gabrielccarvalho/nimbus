import type { Metadata } from "next"

import { ChannelList } from "@/components/settings/account-settings"
import { getChannelSettings } from "@/features/accounts/queries"

export const metadata: Metadata = { title: "Connected channels" }

export default async function ChannelsPage() {
  return <ChannelList channels={await getChannelSettings()} />
}
