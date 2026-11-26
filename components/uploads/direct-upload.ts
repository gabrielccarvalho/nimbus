import {
  completeUploadAction,
  signUploadPartsAction,
  startUploadAction,
} from "@/features/uploads/actions"
import type {
  CompletedUpload,
  StartedUpload,
  UploadKind,
} from "@/features/uploads/schema"

type Multipart = Extract<StartedUpload["target"], { kind: "multipart" }>

const PART_CONCURRENCY = 4
const PART_RETRIES = 2
const RETRY_DELAY_MS = 1000
const SIGN_BATCH = 16

function send(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onLoaded: (bytes: number, total: number) => void
) {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onLoaded(event.loaded, event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr)
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
    xhr.send(body)
  })
}

async function putParts(
  file: File,
  token: string,
  { partSize, partCount }: Multipart,
  onProgress: (percent: number) => void
) {
  const loaded = new Array<number>(partCount).fill(0)
  const report = () =>
    onProgress(
      (loaded.reduce((sum, bytes) => sum + bytes, 0) / file.size) * 100
    )

  const urls = new Map<number, Promise<string>>()
  const urlFor = (partNumber: number) => {
    if (!urls.has(partNumber)) {
      const batch: number[] = []
      for (let n = partNumber; n <= partCount && batch.length < SIGN_BATCH; n++)
        if (!urls.has(n)) batch.push(n)
      const signed = signUploadPartsAction(token, batch).then((result) => {
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      })
      for (const n of batch) {
        const url = signed.then(
          (parts) => parts.find((part) => part.partNumber === n)!.url
        )
        url.catch(() => {})
        urls.set(n, url)
      }
    }
    return urls.get(partNumber)!
  }

  const putPart = async (partNumber: number) => {
    const start = (partNumber - 1) * partSize
    const body = file.slice(start, Math.min(start + partSize, file.size))
    for (let attempt = 0; ; attempt++) {
      let xhr: XMLHttpRequest
      try {
        xhr = await send("PUT", await urlFor(partNumber), {}, body, (bytes) => {
          loaded[partNumber - 1] = bytes
          report()
        })
      } catch (error) {
        loaded[partNumber - 1] = 0
        report()
        // A fresh signature also covers part URLs that expired while waiting.
        urls.delete(partNumber)
        if (attempt >= PART_RETRIES) throw error
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1))
        )
        continue
      }
      const etag = xhr.getResponseHeader("ETag")
      if (!etag) {
        throw new Error(
          "Storage hid the upload's ETag. Expose it in the bucket's CORS rules."
        )
      }
      loaded[partNumber - 1] = body.size
      report()
      return etag
    }
  }

  const etags: string[] = []
  let next = 1
  let failed = false
  const lane = async () => {
    while (next <= partCount && !failed) {
      const partNumber = next++
      try {
        etags[partNumber - 1] = await putPart(partNumber)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, lane)
  )
  return etags.map((etag, i) => ({ partNumber: i + 1, etag }))
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
  const { token, target } = started.value
  let parts: Awaited<ReturnType<typeof putParts>> | undefined
  if (target.kind === "single") {
    await send(
      target.method,
      target.url,
      target.headers,
      file,
      (bytes, total) => onProgress((bytes / total) * 100)
    )
  } else {
    parts = await putParts(file, token, target, onProgress)
  }
  const completed = await completeUploadAction(token, parts)
  if (!completed.ok) throw new Error(completed.error.message)
  return completed.value as CompletedUpload[K]
}
