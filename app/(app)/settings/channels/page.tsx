import type { Metadata } from "next"

import { ChannelList } from "@/components/settings/account-settings"
import { settings } from "@/components/settings/messages"
import { getChannelSettings } from "@/features/accounts/queries"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.channels }
}

export default async function ChannelsPage() {
  return <ChannelList channels={await getChannelSettings()} />
}
