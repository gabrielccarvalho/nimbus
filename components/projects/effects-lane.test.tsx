import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Effect } from "@/features/effects/schema"

import { EffectsLane } from "./effects-lane"

function setup(props: Partial<React.ComponentProps<typeof EffectsLane>> = {}) {
  const onChange = vi.fn()
  render(
    <EffectsLane
      startMs={10_000}
      endMs={30_000}
      events={[]}
      hasWebcam
      currentMs={17_200}
      onChange={onChange}
      {...props}
    />
  )
  return { onChange, user: userEvent.setup() }
}

describe("EffectsLane", () => {
  it("adds a zoom at the playhead", async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add zoom" }))
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "zoom",
        startMs: 17_200,
        endMs: 18_700,
        scale: 1.4,
        focus: { x: 0.5, y: 0.5 },
      },
    ])
  })

  it("deleting a block removes the event", async () => {
    const events: Effect[] = [
      { kind: "focus", startMs: 12_000, endMs: 14_000 },
      { kind: "shake", startMs: 20_000, endMs: 20_500, intensity: "light" },
    ]
    const { onChange, user } = setup({ events })
    await user.click(
      screen.getByRole("button", { name: "Shake light at 0:10.0" })
    )
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    expect(onChange).toHaveBeenCalledWith([events[0]])
  })

  it("full cam add is disabled without a webcam", () => {
    setup({ hasWebcam: false })
    expect(screen.getByRole("button", { name: "Add full cam" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add zoom" })).toBeEnabled()
  })

  it("changing shake intensity updates the event", async () => {
    const events: Effect[] = [
      { kind: "shake", startMs: 20_000, endMs: 20_500, intensity: "light" },
    ]
    const { onChange, user } = setup({ events })
    await user.click(
      screen.getByRole("button", { name: "Shake light at 0:10.0" })
    )
    await user.click(await screen.findByRole("button", { name: "Strong" }))
    expect(onChange).toHaveBeenCalledWith([
      { ...events[0], intensity: "strong" },
    ])
  })

  it("mutes full cam blocks without a webcam", () => {
    setup({
      hasWebcam: false,
      events: [{ kind: "focus", startMs: 12_000, endMs: 14_000 }],
    })
    expect(
      screen.getByRole("button", { name: "Full cam at 0:02.0" })
    ).toHaveAttribute("data-variant", "muted")
  })

  it("dragging stops at the next block of the same kind", () => {
    const events: Effect[] = [
      { kind: "shake", startMs: 12_000, endMs: 12_500, intensity: "light" },
      { kind: "shake", startMs: 14_000, endMs: 14_500, intensity: "strong" },
    ]
    const { onChange } = setup({ events })
    screen.getByRole("group", { name: "Shake" }).getBoundingClientRect = () =>
      ({ left: 0, width: 1000 }) as DOMRect
    const block = screen.getByRole("button", { name: "Shake light at 0:02.0" })
    fireEvent.pointerDown(block, { button: 0, clientX: 100 })
    fireEvent.pointerMove(block, { clientX: 400 })
    expect(onChange).toHaveBeenLastCalledWith([
      { ...events[0], startMs: 13_500, endMs: 14_000 },
      events[1],
    ])
  })
})
