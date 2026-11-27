import type { Metadata } from "next"

import { Landing } from "@/components/marketing/landing"

export const metadata: Metadata = {
  title: { absolute: "nimbus: long streams in, short clips out" },
  description:
    "Drop a long recording. nimbus finds the moments worth a vertical clip, frames your webcam and writes the captions. Nothing is published until you approve it.",
}

// Signed-out visitors see this at "/" (proxy.ts rewrites it); it is static.
export default function WelcomePage() {
  return <Landing />
}
