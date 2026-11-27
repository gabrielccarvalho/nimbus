import type { Metadata } from "next"

import { Landing } from "@/components/marketing/landing"

export const metadata: Metadata = {
  title: { absolute: "nimbus: long streams in, short clips out" },
  description:
    "For streamers and clippers. Paste a YouTube or Twitch link: nimbus picks the moments worth a vertical clip and edits them. Change anything you like. Nothing is published until you approve it.",
}

// Signed-out visitors see this at "/" (proxy.ts rewrites it); it is static.
export default function WelcomePage() {
  return <Landing />
}
