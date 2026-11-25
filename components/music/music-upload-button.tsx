"use client"

import { UploadSimpleIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  MUSIC_ACCEPT,
  MUSIC_MAX_BYTES,
  type MusicTrackSummary,
} from "@/features/music/schema"

function upload(file: File, onProgress: (percent: number) => void) {
  return new Promise<MusicTrackSummary>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/uploads/music")
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    )
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    }
    xhr.onload = () => {
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (
        xhr.status === 201 &&
        body &&
        typeof body === "object" &&
        "track" in body
      ) {
        resolve((body as { track: MusicTrackSummary }).track)
        return
      }
      const message =
        body && typeof body === "object" && "error" in body
          ? (body as { error: { message: string } }).error.message
          : `Upload failed (${xhr.status})`
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error("The upload was interrupted"))
    xhr.send(file)
  })
}

export function MusicUploadButton({
  onUploaded,
  size = "default",
}: {
  onUploaded?: (track: MusicTrackSummary) => void
  size?: "sm" | "default"
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
      const track = await upload(file, setProgress)
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
        disabled={progress !== null}
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
