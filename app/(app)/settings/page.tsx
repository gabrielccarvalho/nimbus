import type { Metadata } from "next"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Transcription, highlight selection, captions and rendering.
      </p>
    </div>
  )
}
