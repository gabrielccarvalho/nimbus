import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TimelineBlock, TimelineTrack } from "./timeline-track"

function setup(
  props: Partial<React.ComponentProps<typeof TimelineBlock>> = {}
) {
  const onChange = vi.fn()
  const onDelete = vi.fn()
  const { container } = render(
    <TimelineTrack aria-label="Zoom" durationMs={10_000}>
      <TimelineBlock
        aria-label="Zoom 1"
        startMs={2000}
        endMs={4000}
        onChange={onChange}
        onDelete={onDelete}
        {...props}
      >
        Zoom
      </TimelineBlock>
    </TimelineTrack>
  )
  container.querySelector<HTMLElement>(
    "[data-slot=timeline-track]"
  )!.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect
  return {
    onChange,
    onDelete,
    block: screen.getByRole("button", { name: "Zoom 1" }),
  }
}

describe("TimelineTrack", () => {
  it("renders blocks at their ms positions", () => {
    const { block } = setup()
    expect(block.style.left).toBe("20%")
    expect(block.style.width).toBe("20%")
  })

  it("dragging moves and reports new range", () => {
    const { block, onChange } = setup()
    fireEvent.pointerDown(block, { button: 0, clientX: 300 })
    fireEvent.pointerMove(block, { clientX: 400 })
    expect(onChange).toHaveBeenLastCalledWith(3000, 5000)
    fireEvent.pointerMove(block, { clientX: 1500 })
    expect(onChange).toHaveBeenLastCalledWith(8000, 10_000)
  })

  it("edge drag resizes and respects minMs", () => {
    const { block, onChange } = setup({ minMs: 500 })
    const end = block.querySelector<HTMLElement>("[data-edge=end]")!
    fireEvent.pointerDown(end, { button: 0, clientX: 400 })
    fireEvent.pointerMove(end, { clientX: 500 })
    expect(onChange).toHaveBeenLastCalledWith(2000, 5000)
    fireEvent.pointerMove(end, { clientX: 0 })
    expect(onChange).toHaveBeenLastCalledWith(2000, 2500)
    fireEvent.pointerUp(end)

    const start = block.querySelector<HTMLElement>("[data-edge=start]")!
    fireEvent.pointerDown(start, { button: 0, clientX: 200 })
    fireEvent.pointerMove(start, { clientX: 1000 })
    expect(onChange).toHaveBeenLastCalledWith(3500, 4000)
  })

  it("arrow keys move by stepMs and Shift resizes", async () => {
    const user = userEvent.setup()
    const { block, onChange } = setup({ stepMs: 250 })
    block.focus()
    await user.keyboard("{ArrowRight}")
    expect(onChange).toHaveBeenLastCalledWith(2250, 4250)
    await user.keyboard("{ArrowLeft}")
    expect(onChange).toHaveBeenLastCalledWith(1750, 3750)
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}")
    expect(onChange).toHaveBeenLastCalledWith(2000, 4250)
  })

  it("Delete calls onDelete", async () => {
    const user = userEvent.setup()
    const { block, onDelete } = setup()
    block.focus()
    await user.keyboard("{Delete}")
    await user.keyboard("{Backspace}")
    expect(onDelete).toHaveBeenCalledTimes(2)
  })

  it("exposes selection and selects on pointer down", () => {
    const onSelect = vi.fn()
    const { block } = setup({ selected: true, onSelect })
    expect(block).toHaveAttribute("aria-pressed", "true")
    fireEvent.pointerDown(block, { button: 0, clientX: 300 })
    expect(onSelect).toHaveBeenCalled()
  })
})
