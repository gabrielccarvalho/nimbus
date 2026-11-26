import {
  completeUploadAction,
  startUploadAction,
} from "@/features/uploads/actions"
import type {
  CompletedUpload,
  StartedUpload,
  UploadKind,
} from "@/features/uploads/schema"

function put(
  file: File,
  target: StartedUpload["target"],
  onProgress: (percent: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.url)
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
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

export async function directUpload<K extends UploadKind>(
  file: File,
  input: { kind: K; options?: unknown },
  onProgress: (percent: number) => void
) {
  const started = await startUploadAction({
    ...input,
    fileName: file.name,
    mime: file.type,
    bytes: file.size,
  })
  if (!started.ok) throw new Error(started.error.message)
  await put(file, started.value.target, onProgress)
  const completed = await completeUploadAction(started.value.token)
  if (!completed.ok) throw new Error(completed.error.message)
  return completed.value as CompletedUpload[K]
}
