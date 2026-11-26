import { PUT } from "@/app/api/uploads/[token]/route"
import {
  completeUploadAction,
  startUploadAction,
} from "@/features/uploads/actions"

export function putUpload(url: string, body: BodyInit | ReadableStream) {
  const token = url.replace("/api/uploads/", "")
  return PUT(
    new Request(`http://localhost${url}`, {
      method: "PUT",
      body,
      duplex: "half",
    } as RequestInit),
    { params: Promise.resolve({ token }) }
  )
}

export async function directUpload(
  input: {
    kind: "video" | "music"
    fileName: string
    mime?: string
    options?: unknown
  },
  data: Uint8Array
) {
  const started = await startUploadAction({
    mime: "",
    ...input,
    bytes: data.length,
  })
  if (!started.ok) return started
  const { target } = started.value
  if (target.kind !== "single") throw new Error("expected a local target")
  const response = await putUpload(target.url, new Uint8Array(data))
  if (!response.ok) {
    const body = (await response.json()) as {
      error: { code: string; message: string }
    }
    return { ok: false as const, error: body.error }
  }
  return completeUploadAction(started.value.token)
}
