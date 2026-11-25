import type { Metadata } from "next"

import { MusicLibrary } from "@/components/settings/music-library"
import { getMusicLibrary } from "@/features/music/queries"

export const metadata: Metadata = { title: "Music" }

export default async function MusicPage() {
  return <MusicLibrary tracks={await getMusicLibrary()} />
}
