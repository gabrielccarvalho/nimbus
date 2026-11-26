import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MusicTrackSummary } from "@/features/music/schema"

import { MusicUploadButton } from "./music-upload-button"

const { refresh, toastError, toastSuccess, startUpload, completeUpload } =
  vi.hoisted(() => ({
    refresh: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    startUpload: vi.fn(),
    completeUpload: vi.fn(),
  }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("@/features/uploads/actions", () => ({
  startUploadAction: startUpload,
  completeUploadAction: completeUpload,
}))
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))

const track: MusicTrackSummary = {
  id: "t1",
  title: "Summer loop",
  status: "processing",
  durationMs: null,
  peaks: null,
  error: null,
  url: "/api/music/t1",
  usedBy: 0,
}

class FakeXhr {
  static last: FakeXhr
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

function pick(file: File) {
  fireEvent.change(screen.getByTestId("music-file-input"), {
    target: { files: [file] },
  })
}

const target = {
  kind: "single",
  url: "https://bucket.example/tmp/uploads/u1.part?sig=1",
  method: "PUT",
  headers: { "Content-Type": "audio/mpeg" },
}

async function sending() {
  await waitFor(() => expect(FakeXhr.last).toBeDefined())
  return FakeXhr.last
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeXhr.last = undefined as unknown as FakeXhr
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
  startUpload.mockResolvedValue({ ok: true, value: { token: "tok", target } })
  completeUpload.mockResolvedValue({
    ok: true,
    value: { trackId: track.id, track },
  })
})

describe("MusicUploadButton", () => {
  it("can be disabled", () => {
    render(<MusicUploadButton disabled />)
    expect(
      screen.getByRole("button", { name: "Upload a track" })
    ).toBeDisabled()
  })

  it("refuses a file over 50 MB without sending", () => {
    render(<MusicUploadButton />)
    const big = new File(["x"], "big.mp3", { type: "audio/mpeg" })
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 })
    pick(big)
    expect(toastError).toHaveBeenCalledWith("Music files can be up to 50 MB")
    expect(startUpload).not.toHaveBeenCalled()
    expect(FakeXhr.last).toBeUndefined()
  })

  it("shows progress while sending and reports the uploaded track", async () => {
    const onUploaded = vi.fn()
    render(<MusicUploadButton onUploaded={onUploaded} />)
    const file = new File(["x"], "Summer loop.mp3", { type: "audio/mpeg" })
    pick(file)
    const xhr = await sending()
    expect(startUpload).toHaveBeenCalledWith({
      kind: "music",
      fileName: "Summer loop.mp3",
      mime: "audio/mpeg",
      bytes: 1,
    })
    expect(xhr.open).toHaveBeenCalledWith("PUT", target.url)
    expect(xhr.headers).toEqual(target.headers)
    expect(xhr.send).toHaveBeenCalledWith(file)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 })
    const busy = await screen.findByRole("button", { name: "Uploading… 40%" })
    expect(busy).toBeDisabled()

    xhr.status = 200
    xhr.onload?.()
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(track))
    expect(completeUpload).toHaveBeenCalledWith("tok", undefined)
    expect(toastSuccess).toHaveBeenCalledWith("Added “Summer loop”")
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeEnabled()
  })

  it("toasts the server's message on failure", async () => {
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    const xhr = await sending()
    xhr.status = 415
    xhr.responseText = JSON.stringify({ error: { message: "Not audio" } })
    xhr.onload?.()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Not audio"))
    expect(completeUpload).not.toHaveBeenCalled()
  })

  it("toasts a refused start without sending", async () => {
    startUpload.mockResolvedValue({
      ok: false,
      error: { code: "TOO_LARGE", message: "Music files can be up to 50 MB" },
    })
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Music files can be up to 50 MB")
    )
    expect(FakeXhr.last).toBeUndefined()
  })

  it("toasts a refused completion", async () => {
    completeUpload.mockResolvedValue({
      ok: false,
      error: {
        code: "UNSUPPORTED_MEDIA",
        message: "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file",
      },
    })
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    const xhr = await sending()
    xhr.status = 200
    xhr.onload?.()
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file"
      )
    )
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeEnabled()
  })

  it("announces progress in coarse steps", async () => {
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    const xhr = await sending()
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 47,
      total: 100,
    })
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Uploading… 40%"
    )
  })

  it("toasts and re-enables the button when the upload is interrupted", async () => {
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    const xhr = await sending()
    xhr.onerror?.()
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("The upload was interrupted")
    )
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeEnabled()
  })
})
