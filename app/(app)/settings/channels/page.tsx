import { redirect } from "next/navigation"

// Channels moved to a page of their own (ADR-0077). Old links still land.
export default function ChannelsSettingsRedirect() {
  redirect("/channels")
}
