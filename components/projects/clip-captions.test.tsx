import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { VideoPlayerProvider } from "@/components/ui/video-player"
import {
  buildCaptionPages,
  editCaptionPages,
  type CaptionWord,
} from "@/features/captions/pages"

import { ClipCaptionsCard, rulerTicks, type PageEdits } from "./clip-captions"

const words: CaptionWord[] = [
  { text: "wait", startMs: 500, endMs: 800 },
  { text: "what.", startMs: 800, endMs: 1100 },
  { text: "no", startMs: 3000, endMs: 3300 },
  { text: "way.", startMs: 3300, endMs: 3600 },
]
const basePages = buildCaptionPages(words, 6000)

function setup(
  props: Partial<React.ComponentProps<typeof ClipCaptionsCard>> = {}
) {
  const onPageEditsChange = vi.fn()
  const onOffsetChange = vi.fn()
  const onEnabledChange = vi.fn()
  const pageEdits: PageEdits = props.pageEdits ?? {}
  const offsetMs = props.offsetMs ?? 0
  render(
    <VideoPlayerProvider>
      <ClipCaptionsCard
        startMs={10_000}
        durationMs={6000}
        basePages={basePages}
        pages={editCaptionPages(
          basePages,
          {
            pages: Object.entries(pageEdits).map(([index, edit]) => ({
              index: Number(index),
              ...edit,
            })),
            offsetMs,
          },
          6000
        )}
        enabled
        onEnabledChange={onEnabledChange}
        pageEdits={pageEdits}
        onPageEditsChange={onPageEditsChange}
        offsetMs={offsetMs}
        onOffsetChange={onOffsetChange}
        {...props}
      />
    </VideoPlayerProvider>
  )
  return {
    onPageEditsChange,
    onOffsetChange,
    onEnabledChange,
    user: userEvent.setup(),
  }
}

describe("ClipCaptionsCard", () => {
  it("re-times a caption from the keyboard", async () => {
    const { onPageEditsChange, user } = setup()
    const block = screen.getByRole("button", { name: /^Caption 1 at 0:00\.5:/ })
    block.focus()
    await user.keyboard("{ArrowRight}")
    const first = basePages[0]!
    expect(onPageEditsChange).toHaveBeenCalledWith({
      0: { startMs: first.startMs + 100, endMs: first.endMs + 100 },
    })
  })

  it("stores the time before the clip offset", async () => {
    const { onPageEditsChange, user } = setup({ offsetMs: 200 })
    const block = screen.getByRole("button", { name: /^Caption 1 at 0:00\.7:/ })
    block.focus()
    await user.keyboard("{ArrowRight}")
    const first = basePages[0]!
    expect(onPageEditsChange).toHaveBeenCalledWith({
      0: { startMs: first.startMs + 100, endMs: first.endMs + 100 },
    })
  })

  it("won't push a caption into the next one", async () => {
    const { onPageEditsChange, user } = setup()
    const block = screen.getByRole("button", { name: /^Caption 1 at 0:00\.5:/ })
    block.focus()
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}")
    for (const [edits] of onPageEditsChange.mock.calls) {
      expect((edits as PageEdits)[0]!.endMs).toBeLessThanOrEqual(
        basePages[1]!.startMs
      )
    }
  })

  it("shifts every caption", async () => {
    const { onOffsetChange, user } = setup({ offsetMs: 300 })
    expect(screen.getByText("+0.3 s")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Show captions later" })
    )
    expect(onOffsetChange).toHaveBeenCalledWith(400)
    await user.click(
      screen.getByRole("button", { name: "Show captions earlier" })
    )
    expect(onOffsetChange).toHaveBeenCalledWith(200)
  })

  it("edits a caption's text from its block", async () => {
    const { onPageEditsChange, user } = setup()
    await user.click(
      screen.getByRole("button", { name: /^Caption 2 at 0:03\.0:/ })
    )
    await user.type(await screen.findByLabelText("Caption text"), "!")
    expect(onPageEditsChange).toHaveBeenLastCalledWith({
      1: { text: "no way.!" },
    })
  })

  it("turns captions off and hides the lane", async () => {
    const { onEnabledChange, user } = setup({ enabled: false })
    expect(
      screen.queryByRole("group", { name: "Caption timing" })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("switch", { name: "Show captions on this clip" })
    )
    expect(onEnabledChange).toHaveBeenCalledWith(true)
  })

  it("widens the lane as you zoom in and fits it back", async () => {
    const { user } = setup()
    const lane = () =>
      screen.getByTestId("captions-scroller").firstElementChild as HTMLElement
    expect(lane().style.width).toBe("max(100%, 600px)")
    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(lane().style.width).toBe("max(100%, 1200px)")
    await user.click(screen.getByRole("button", { name: "Fit" }))
    expect(lane().style.width).toBe("100%")
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled()
  })
})

describe("rulerTicks", () => {
  it("spaces ticks so their labels don't collide", () => {
    expect(rulerTicks(6000, 600)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000,
    ])
    expect(rulerTicks(60_000, 600)).toEqual([
      0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000,
    ])
    expect(rulerTicks(6000, 0)).toEqual([])
  })
})
