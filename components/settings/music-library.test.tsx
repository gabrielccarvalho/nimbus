import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MusicTrackSummary } from "@/features/music/schema"

import { MusicLibrary } from "./music-library"

const { rename, remove, refresh, toastError, toastSuccess } = vi.hoisted(
  () => ({
    rename: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  })
)
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))
vi.mock("@/features/music/actions", () => ({
  renameMusicTrackAction: rename,
  deleteMusicTrackAction: remove,
}))

const track = (over: Partial<MusicTrackSummary> = {}): MusicTrackSummary => ({
  id: "t1",
  title: "Summer loop",
  durationMs: 130_000,
  peaks: [],
  url: "/api/music/t1",
  usedBy: 0,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  rename.mockResolvedValue({ ok: true, data: undefined })
  remove.mockResolvedValue({ ok: true, data: undefined })
})

describe("MusicLibrary", () => {
  it("titles the section and offers an upload", () => {
    render(<MusicLibrary tracks={[]} />)
    expect(screen.getByRole("heading", { name: "Music library" })).toBeVisible()
    expect(
      screen.getByText(
        "Tracks here can go under any clip in this workspace. MP3, M4A, AAC, WAV, OGG or FLAC, up to 50 MB."
      )
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Upload a track" })).toBeVisible()
  })

  it("explains an empty library", () => {
    render(<MusicLibrary tracks={[]} />)
    expect(screen.getByText("No music yet")).toBeVisible()
    expect(
      screen.getByText("Upload a track to put it under your clips.")
    ).toBeVisible()
  })

  it("shows title, duration and usage for each track", () => {
    render(
      <MusicLibrary
        tracks={[
          track(),
          track({ id: "t2", title: "Two", usedBy: 1 }),
          track({ id: "t3", title: "Three", usedBy: 3 }),
        ]}
      />
    )
    expect(
      screen.getAllByRole("textbox", { name: "Track title" })
    ).toHaveLength(3)
    expect(screen.getByDisplayValue("Summer loop")).toBeVisible()
    expect(screen.getByText(/^2:10 · Not used$/)).toBeVisible()
    expect(screen.getByText(/Under 1 clip$/)).toBeVisible()
    expect(screen.getByText(/Under 3 clips$/)).toBeVisible()
  })

  it("renames on blur only when the title changed", async () => {
    const user = userEvent.setup()
    render(<MusicLibrary tracks={[track()]} />)
    const input = screen.getByRole("textbox", { name: "Track title" })
    await user.click(input)
    await user.tab()
    expect(rename).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "New name")
    await user.tab()
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1))
    expect(rename).toHaveBeenCalledWith("t1", "New name")
  })

  it("deletes after confirmation", async () => {
    const user = userEvent.setup()
    render(<MusicLibrary tracks={[track()]} />)
    await user.click(screen.getByRole("button", { name: "Delete Summer loop" }))
    expect(
      await screen.findByRole("alertdialog", { name: "Delete “Summer loop”?" })
    ).toBeVisible()
    expect(
      screen.getByText(
        "The file is removed from this workspace. This can't be undone."
      )
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Delete track" }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith("t1"))
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Track deleted")
    )
  })

  it("toasts the refusal when a clip uses the track", async () => {
    remove.mockResolvedValue({
      ok: false,
      error: { code: "conflict", message: "Used by “Clip 1”" },
    })
    const user = userEvent.setup()
    render(<MusicLibrary tracks={[track({ usedBy: 1 })]} />)
    await user.click(screen.getByRole("button", { name: "Delete Summer loop" }))
    await user.click(
      await screen.findByRole("button", { name: "Delete track" })
    )
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Used by “Clip 1”")
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("keeps focus on the same control when a rename lands", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MusicLibrary tracks={[track()]} />)
    const input = screen.getByRole("textbox", { name: "Track title" })
    await user.clear(input)
    await user.type(input, "New name")
    await user.tab()
    const del = screen.getByRole("button", { name: "Delete Summer loop" })
    expect(del).toHaveFocus()
    rerender(<MusicLibrary tracks={[track({ title: "New name" })]} />)
    expect(screen.getByDisplayValue("New name")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Delete New name" })
    ).toHaveFocus()
  })

  it("returns focus to the input after committing with Enter", async () => {
    const user = userEvent.setup()
    render(<MusicLibrary tracks={[track()]} />)
    const input = screen.getByRole("textbox", { name: "Track title" })
    await user.clear(input)
    await user.type(input, "New name{Enter}")
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(input).toHaveFocus())
  })
})
