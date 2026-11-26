import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useRecordingUpload } from "./project-uploader"

const { push, toastError, toastSuccess, startUpload, completeUpload } =
  vi.hoisted(() => ({
    push: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    startUpload: vi.fn(),
    completeUpload: vi.fn(),
  }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))
vi.mock("@/features/uploads/actions", () => ({
  startUploadAction: startUpload,
  completeUploadAction: completeUpload,
}))

class FakeXhr {
  static last: FakeXhr | undefined
  status = 0
  responseText = ""
  headers: Record<string, string> = {}
  upload: { onprogress?: (event: unknown) => void } = {}
  onload?: () => void
  onerror?: () => void
  open = vi.fn()
  send = vi.fn()
  setRequestHeader = (name: string, value: string) => {
    this.headers[name] = value
  }
  constructor() {
    FakeXhr.last = this
  }
}

const target = {
  url: "https://bucket.example/tmp/uploads/u1.part?sig=1",
  method: "PUT",
  headers: { "Content-Type": "video/mp4" },
}

async function sending() {
  await waitFor(() => expect(FakeXhr.last).toBeDefined())
  return FakeXhr.last!
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeXhr.last = undefined
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => {},
    })
  )
  startUpload.mockResolvedValue({ ok: true, value: { token: "tok", target } })
  completeUpload.mockResolvedValue({ ok: true, value: { projectId: "p1" } })
})

describe("useRecordingUpload", () => {
  it("puts the file to the signed target, completes it and opens the project", async () => {
    const { result } = renderHook(() => useRecordingUpload({ language: "pt" }))
    const file = new File(["video"], "my stream.mp4", { type: "video/mp4" })
    act(() => void result.current.start(file))

    const xhr = await sending()
    expect(startUpload).toHaveBeenCalledWith({
      kind: "video",
      fileName: "my stream.mp4",
      mime: "video/mp4",
      bytes: 5,
      options: { language: "pt" },
    })
    expect(xhr.open).toHaveBeenCalledWith("PUT", target.url)
    expect(xhr.headers).toEqual(target.headers)
    expect(xhr.send).toHaveBeenCalledWith(file)

    act(() =>
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    )
    expect(result.current.progress).toBe(25)

    xhr.status = 200
    act(() => xhr.onload?.())
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1"))
    expect(completeUpload).toHaveBeenCalledWith("tok")
    expect(toastSuccess).toHaveBeenCalledWith(
      "Upload complete. Processing started."
    )
  })

  it("toasts a refused start and never sends", async () => {
    startUpload.mockResolvedValue({
      ok: false,
      error: {
        code: "TOO_LARGE",
        message: "This file is larger than the upload limit",
      },
    })
    const { result } = renderHook(() => useRecordingUpload({}))
    await act(() => result.current.start(new File(["v"], "a.mp4")))
    expect(toastError).toHaveBeenCalledWith(
      "This file is larger than the upload limit"
    )
    expect(FakeXhr.last).toBeUndefined()
    expect(result.current.progress).toBeNull()
  })

  it("toasts the PUT's error and skips completion", async () => {
    const { result } = renderHook(() => useRecordingUpload({}))
    act(() => void result.current.start(new File(["v"], "a.mp4")))
    const xhr = await sending()
    xhr.status = 415
    xhr.responseText = JSON.stringify({
      error: { message: "This file doesn't look like a supported video" },
    })
    act(() => xhr.onload?.())
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This file doesn't look like a supported video"
      )
    )
    expect(completeUpload).not.toHaveBeenCalled()
  })

  it("names the status when storage answers without JSON", async () => {
    const { result } = renderHook(() => useRecordingUpload({}))
    act(() => void result.current.start(new File(["v"], "a.mp4")))
    const xhr = await sending()
    xhr.status = 403
    xhr.responseText = "<Error><Code>AccessDenied</Code></Error>"
    act(() => xhr.onload?.())
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Upload failed (403)")
    )
  })

  it("toasts a refused completion", async () => {
    completeUpload.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "The upload didn't arrive" },
    })
    const { result } = renderHook(() => useRecordingUpload({}))
    act(() => void result.current.start(new File(["v"], "a.mp4")))
    const xhr = await sending()
    xhr.status = 204
    act(() => xhr.onload?.())
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("The upload didn't arrive")
    )
    expect(push).not.toHaveBeenCalled()
  })
})
