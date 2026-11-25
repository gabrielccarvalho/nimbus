import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MusicTrackSummary } from "@/features/music/schema"

import { MusicUploadButton } from "./music-upload-button"

const { refresh, toastError, toastSuccess } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))

const track: MusicTrackSummary = {
  id: "t1",
  title: "Summer loop",
  durationMs: 130_000,
  peaks: [],
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
})

describe("MusicUploadButton", () => {
  it("refuses a file over 50 MB without sending", () => {
    render(<MusicUploadButton />)
    const big = new File(["x"], "big.mp3", { type: "audio/mpeg" })
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 })
    pick(big)
    expect(toastError).toHaveBeenCalledWith("Music files can be up to 50 MB")
    expect(FakeXhr.last).toBeUndefined()
  })

  it("shows progress while sending and reports the uploaded track", async () => {
    const onUploaded = vi.fn()
    render(<MusicUploadButton onUploaded={onUploaded} />)
    pick(new File(["x"], "Summer loop.mp3", { type: "audio/mpeg" }))
    const xhr = FakeXhr.last
    expect(xhr.open).toHaveBeenCalledWith("POST", "/api/uploads/music")
    expect(xhr.headers["x-file-name"]).toBe("Summer%20loop.mp3")
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 })
    const busy = await screen.findByRole("button", { name: "Uploading… 40%" })
    expect(busy).toBeDisabled()

    xhr.status = 201
    xhr.responseText = JSON.stringify({ track })
    xhr.onload?.()
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(track))
    expect(toastSuccess).toHaveBeenCalledWith("Added “Summer loop”")
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeEnabled()
  })

  it("toasts the server's message on failure", async () => {
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    const xhr = FakeXhr.last
    xhr.status = 422
    xhr.responseText = JSON.stringify({ error: { message: "No audio found" } })
    xhr.onload?.()
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("No audio found")
    )
  })

  it("announces progress in coarse steps", async () => {
    render(<MusicUploadButton />)
    pick(new File(["x"], "a.mp3", { type: "audio/mpeg" }))
    FakeXhr.last.upload.onprogress?.({
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
    FakeXhr.last.onerror?.()
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("The upload was interrupted")
    )
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeEnabled()
  })
})
