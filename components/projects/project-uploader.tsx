"use client"

import { UploadSimpleIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  Dropzone,
  DropzoneDescription,
  DropzoneIcon,
  DropzoneTitle,
  type DropzoneRejection,
} from "@/components/ui/dropzone"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { formatBytes } from "@/lib/format"

const ACCEPT = [
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

function upload(file: File, onProgress: (percent: number) => void) {
  return new Promise<{ projectId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/uploads")
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

const REJECTION_MESSAGES: Record<DropzoneRejection["reason"], string> = {
  type: "Upload an MP4, MOV, MKV or WebM video",
  size: "This file is larger than the upload limit",
  count: "Upload one video at a time",
}

export function ProjectUploader({ maxBytes }: { maxBytes: number }) {
  const router = useRouter()
  const [progress, setProgress] = React.useState<number | null>(null)
  const [fileName, setFileName] = React.useState("")

  const start = async (file: File) => {
    setFileName(file.name)
    setProgress(0)
    try {
      const { projectId } = await upload(file, setProgress)
      toast.success("Upload complete. Processing started.")
      router.push(`/projects/${projectId}`)
    } catch (error) {
      toast.error((error as Error).message)
      setProgress(null)
    }
  }

  if (progress !== null) {
    return (
      <div className="flex min-h-48 flex-col justify-center gap-3 rounded-xl border-2 border-dashed p-6">
        <Progress value={Math.round(progress)}>
          <ProgressLabel className="truncate">
            Uploading {fileName}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
      </div>
    )
  }

  return (
    <Dropzone
      accept={ACCEPT}
      maxSize={maxBytes}
      onFilesAccepted={([file]) => file && void start(file)}
      onFilesRejected={([rejection]) =>
        rejection && toast.error(REJECTION_MESSAGES[rejection.reason])
      }
    >
      <DropzoneIcon>
        <UploadSimpleIcon />
      </DropzoneIcon>
      <DropzoneTitle>Drop a recording or click to browse</DropzoneTitle>
      <DropzoneDescription>
        MP4, MOV, MKV or WebM, up to {formatBytes(maxBytes)}
      </DropzoneDescription>
    </Dropzone>
  )
}
