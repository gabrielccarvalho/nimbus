"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import type { DropzoneRejection } from "@/components/ui/dropzone"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import type { ImportOptions } from "@/features/projects/schema"

export const ACCEPT = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  ".mp4",
  ".m4v",
  ".mov",
  ".mkv",
  ".webm",
]

export const REJECTION_MESSAGES: Record<DropzoneRejection["reason"], string> = {
  type: "Upload an MP4, MOV, MKV or WebM video",
  size: "This file is larger than the upload limit",
  count: "Upload one video at a time",
}

function upload(
  file: File,
  options: ImportOptions,
  onProgress: (percent: number) => void
) {
  return new Promise<{ projectId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/uploads")
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    )
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name))
    xhr.setRequestHeader(
      "x-import-options",
      encodeURIComponent(JSON.stringify(options))
    )
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
        "projectId" in body
      ) {
        resolve(body as { projectId: string })
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

async function capturePreview(file: File): Promise<string | null> {
  const src = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.preload = "metadata"
  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(event, () => resolve(), { once: true })
      video.addEventListener("error", () => reject(video.error), {
        once: true,
      })
    })
  try {
    video.src = src
    await once("loadedmetadata")
    video.currentTime = Number.isFinite(video.duration)
      ? video.duration * 0.1
      : 0
    await once("seeked")
    const canvas = document.createElement("canvas")
    canvas.width = 320
    canvas.height = Math.round((320 * video.videoHeight) / video.videoWidth)
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.8)
  } catch {
    return null
  } finally {
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(src)
  }
}

export function useRecordingUpload(options: ImportOptions) {
  const router = useRouter()
  const [progress, setProgress] = React.useState<number | null>(null)
  const [fileName, setFileName] = React.useState("")
  const [preview, setPreview] = React.useState<string | null>(null)

  const start = async (file: File) => {
    setFileName(file.name)
    setPreview(null)
    setProgress(0)
    void capturePreview(file).then(setPreview)
    try {
      const { projectId } = await upload(file, options, setProgress)
      toast.success("Upload complete. Processing started.")
      router.push(`/projects/${projectId}`)
    } catch (error) {
      toast.error((error as Error).message)
      setProgress(null)
    }
  }

  return { start, progress, fileName, preview }
}

export function UploadProgress({
  progress,
  fileName,
  preview,
}: {
  progress: number
  fileName: string
  preview: string | null
}) {
  return (
    <div className="flex w-full flex-col items-center gap-5 sm:flex-row">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from a local file
        <img
          src={preview}
          alt=""
          className="aspect-video w-48 shrink-0 rounded-xl object-cover"
        />
      )}
      <Progress value={Math.round(progress)} className="w-full min-w-0">
        <ProgressLabel className="truncate">Uploading {fileName}</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  )
}
