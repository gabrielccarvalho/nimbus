import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useRecordingUpload } from "./project-uploader"

const {
  push,
  toastError,
  toastSuccess,
  startUpload,
  signParts,
  completeUpload,
} = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  startUpload: vi.fn(),
  signParts: vi.fn(),
  completeUpload: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))
vi.mock("@/features/uploads/actions", () => ({
  startUploadAction: startUpload,
  signUploadPartsAction: signParts,
  completeUploadAction: completeUpload,
}))

class FakeXhr {
  static last: FakeXhr | undefined
  static all: FakeXhr[] = []
  status = 0
  etag: string | null = null
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
  getResponseHeader = (name: string) => (name === "ETag" ? this.etag : null)
  constructor() {
    FakeXhr.last = this
    FakeXhr.all.push(this)
  }
}

const target = {
  kind: "single",
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
  FakeXhr.all = []
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
    expect(completeUpload).toHaveBeenCalledWith("tok", undefined)
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

  describe("multipart", () => {
    const multipart = {
      kind: "multipart",
      uploadId: "up1",
      partSize: 4,
      partCount: 3,
    }
    const file = new File(["0123456789"], "long stream.mp4", {
      type: "video/mp4",
    })

    beforeEach(() => {
      startUpload.mockResolvedValue({
        ok: true,
        value: { token: "tok", target: multipart },
      })
      signParts.mockImplementation(
        async (_token: string, numbers: number[]) => ({
          ok: true,
          value: numbers.map((partNumber) => ({
            partNumber,
            url: `https://bucket.example/part-${partNumber}?n=${signParts.mock.calls.length}`,
          })),
        })
      )
    })

    const partFor = (xhr: FakeXhr) =>
      Number(/part-(\d+)/.exec(xhr.open.mock.calls[0]![1] as string)![1])

    function succeed(xhr: FakeXhr) {
      xhr.status = 200
      xhr.etag = `"etag-${partFor(xhr)}"`
      act(() => xhr.onload?.())
    }

    it("puts every part, reports overall progress and completes with the ETags", async () => {
      const { result } = renderHook(() => useRecordingUpload({}))
      act(() => void result.current.start(file))

      await waitFor(() => expect(FakeXhr.all).toHaveLength(3))
      expect(signParts).toHaveBeenCalledTimes(1)
      expect(signParts).toHaveBeenCalledWith("tok", [1, 2, 3])
      const sent = FakeXhr.all.map((xhr) => xhr.send.mock.calls[0]![0] as Blob)
      expect(sent.map((blob) => blob.size)).toEqual([4, 4, 2])
      expect(await sent[2]!.text()).toBe("89")
      for (const xhr of FakeXhr.all) {
        expect(xhr.open).toHaveBeenCalledWith("PUT", expect.any(String))
        expect(xhr.headers).toEqual({})
      }

      act(() =>
        FakeXhr.all[0]!.upload.onprogress?.({
          lengthComputable: true,
          loaded: 2,
          total: 4,
        })
      )
      expect(result.current.progress).toBe(20)
      for (const xhr of [...FakeXhr.all].reverse()) succeed(xhr)
      await waitFor(() => expect(result.current.progress).toBe(100))

      await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1"))
      expect(completeUpload).toHaveBeenCalledWith("tok", [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
        { partNumber: 3, etag: '"etag-3"' },
      ])
    })

    it("retries a failed part with a fresh URL", async () => {
      const { result } = renderHook(() => useRecordingUpload({}))
      act(() => void result.current.start(file))
      await waitFor(() => expect(FakeXhr.all).toHaveLength(3))
      const [first, second, third] = FakeXhr.all
      act(() => second!.onerror?.())
      succeed(first!)
      succeed(third!)

      await waitFor(() => expect(FakeXhr.all).toHaveLength(4), {
        timeout: 3000,
      })
      const retry = FakeXhr.all[3]!
      expect(partFor(retry)).toBe(2)
      expect(signParts).toHaveBeenLastCalledWith("tok", [2])
      expect(retry.open.mock.calls[0]![1]).not.toBe(
        second!.open.mock.calls[0]![1]
      )
      succeed(retry)

      await waitFor(() => expect(completeUpload).toHaveBeenCalled())
      expect(completeUpload.mock.calls[0]![1]).toHaveLength(3)
    })

    it("gives up on a part after its retries and skips completion", async () => {
      startUpload.mockResolvedValue({
        ok: true,
        value: { token: "tok", target: { ...multipart, partCount: 1 } },
      })
      const { result } = renderHook(() => useRecordingUpload({}))
      act(() => void result.current.start(new File(["0123"], "short.mp4")))
      for (let attempt = 1; attempt <= 3; attempt++) {
        await waitFor(() => expect(FakeXhr.all).toHaveLength(attempt), {
          timeout: 3000,
        })
        FakeXhr.all[attempt - 1]!.status = 403
        act(() => FakeXhr.all[attempt - 1]!.onload?.())
      }
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith("Upload failed (403)")
      )
      expect(completeUpload).not.toHaveBeenCalled()
    }, 10_000)

    it("names a hidden ETag", async () => {
      const { result } = renderHook(() => useRecordingUpload({}))
      act(() => void result.current.start(file))
      await waitFor(() => expect(FakeXhr.all).toHaveLength(3))
      for (const xhr of FakeXhr.all) {
        xhr.status = 200
        act(() => xhr.onload?.())
      }
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          "Storage hid the upload's ETag. Expose it in the bucket's CORS rules."
        )
      )
      expect(FakeXhr.all).toHaveLength(3)
      expect(completeUpload).not.toHaveBeenCalled()
    })
  })
})
