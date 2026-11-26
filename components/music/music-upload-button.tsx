"use client"

import { UploadSimpleIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { directUpload } from "@/components/uploads/direct-upload"
import {
  MUSIC_ACCEPT,
  MUSIC_MAX_BYTES,
  type MusicTrackSummary,
} from "@/features/music/schema"

export function MusicUploadButton({
  onUploaded,
  size = "default",
  disabled = false,
}: {
  onUploaded?: (track: MusicTrackSummary) => void
  size?: "sm" | "default"
  disabled?: boolean
}) {
  const router = useRouter()
  const input = React.useRef<HTMLInputElement>(null)
  const [progress, setProgress] = React.useState<number | null>(null)

  const start = async (file: File) => {
    if (file.size > MUSIC_MAX_BYTES) {
      toast.error("Music files can be up to 50 MB")
      return
    }
    setProgress(0)
    try {
      const { track } = await directUpload(file, { kind: "music" }, setProgress)
      toast.success(`Added “${track.title}”`)
      onUploaded?.(track)
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={MUSIC_ACCEPT}
        hidden
        data-testid="music-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void start(file)
        }}
      />
      <Button
        type="button"
        size={size}
        disabled={disabled || progress !== null}
        onClick={() => input.current?.click()}
      >
        <UploadSimpleIcon data-icon="inline-start" aria-hidden />
        {progress === null
          ? "Upload a track"
          : `Uploading… ${Math.round(progress)}%`}
      </Button>
      <span role="status" className="sr-only">
        {progress === null
          ? ""
          : `Uploading… ${Math.min(100, Math.floor(progress / 10) * 10)}%`}
      </span>
    </>
  )
}
