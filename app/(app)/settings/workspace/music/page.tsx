import type { Metadata } from "next"

import { settings } from "@/components/settings/messages"
import { MusicLibrary } from "@/components/settings/music-library"
import { getMusicLibrary } from "@/features/music/queries"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.music }
}

export default async function MusicPage() {
  return <MusicLibrary tracks={await getMusicLibrary()} />
}
