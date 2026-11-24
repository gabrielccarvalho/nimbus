import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createClipAction } from "@/features/clips/actions"
import type { Segment, Word } from "@/features/transcription/schema"

import { TranscriptView } from "./transcript-view"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/clips/actions", () => ({ createClipAction: vi.fn() }))

const lines = ["First line here", "Then a second", "And a third one"]
const words: Word[] = lines.flatMap((line, i) =>
  line.split(" ").map((text, j) => ({
    text,
    startMs: i * 2000 + j * 400,
    endMs: i * 2000 + j * 400 + 300,
    confidence: 1,
  }))
)
let cursor = 0
const segments: Segment[] = lines.map((text, i) => {
  const firstWord = cursor
  cursor += text.split(" ").length
  return {
    text,
    startMs: i * 2000,
    endMs: i * 2000 + 1900,
    firstWord,
    lastWord: cursor - 1,
  }
})

function renderView() {
  render(
    <TranscriptView
      projectId="p1"
      src="/media/proxy.mp4"
      durationMs={60_000}
      words={words}
      segments={segments}
      language="en"
      clips={[{ id: "c1", title: "Best bit", startMs: 2000, endMs: 5000 }]}
    />
  )
}

beforeEach(() => {
  vi.mocked(createClipAction).mockReset()
  push.mockReset()
})

describe("TranscriptView", () => {
  it("heads the lines of each clip with a link to it", () => {
    renderView()
    expect(screen.getByRole("link", { name: "Best bit" })).toHaveAttribute(
      "href",
      "/projects/p1/clips/c1"
    )
    expect(screen.getByText(/3 lines · 10 words · English/)).toBeVisible()
  })

  it("makes a clip from a shift-selected range of lines", async () => {
    vi.mocked(createClipAction).mockResolvedValue({
      ok: true,
      value: { clipId: "new" },
    } as never)
    renderView()
    const make = screen.getByRole("button", { name: "Make a clip" })
    await userEvent.click(
      screen.getByRole("button", { name: "Play from 0:00.0" })
    )
    expect(screen.getByText(/at least 3 s needed/)).toBeVisible()
    expect(make).toBeDisabled()

    const user = userEvent.setup()
    await user.keyboard("{Shift>}")
    await user.click(screen.getByRole("button", { name: "Play from 0:04.0" }))
    await user.keyboard("{/Shift}")
    expect(screen.getByText(/^3 lines · 0:00\.0 → 0:05\.9$/)).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Play from 0:02.0" })
    ).toHaveAttribute("aria-pressed", "true")

    await user.click(make)
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/projects/p1/clips/new")
    )
    expect(createClipAction).toHaveBeenCalledWith("p1", {
      startMs: 0,
      endMs: 5900,
    })
  })
})
