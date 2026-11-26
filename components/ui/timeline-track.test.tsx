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

  it("ignores Delete without onDelete and does not prevent default", () => {
    const { block } = setup({ onDelete: undefined })
    expect(fireEvent.keyDown(block, { key: "Delete" })).toBe(true)
  })

  it("pointercancel ends a drag", () => {
    const onPointerCancel = vi.fn()
    const { block, onChange } = setup({ onPointerCancel })
    fireEvent.pointerDown(block, { button: 0, clientX: 300 })
    fireEvent.pointerCancel(block)
    fireEvent.pointerMove(block, { clientX: 400 })
    expect(onChange).not.toHaveBeenCalled()
    expect(onPointerCancel).toHaveBeenCalled()
  })

  it("exposes selection and selects on pointer down", () => {
    const onSelect = vi.fn()
    const { block } = setup({ selected: true, onSelect })
    expect(block).toHaveAttribute("aria-pressed", "true")
    fireEvent.pointerDown(block, { button: 0, clientX: 300 })
    expect(onSelect).toHaveBeenCalled()
  })
})

describe("TimelineBlock snapping and tones", () => {
  it("snaps a moved block's edges to the given times", () => {
    const { block, onChange } = setup({ snapMs: [5000] })
    fireEvent.pointerDown(block, { button: 0, clientX: 300 })
    fireEvent.pointerMove(block, { clientX: 397 })
    expect(onChange).toHaveBeenLastCalledWith(3000, 5000)
    fireEvent.pointerMove(block, { clientX: 604 })
    expect(onChange).toHaveBeenLastCalledWith(5000, 7000)
    fireEvent.pointerMove(block, { clientX: 450 })
    expect(onChange).toHaveBeenLastCalledWith(3500, 5500)
  })

  it("snaps a resized edge and ignores the block's own edges", () => {
    const { block, onChange } = setup({ snapMs: [2000, 4000, 6000] })
    const end = block.querySelector<HTMLElement>("[data-edge=end]")!
    fireEvent.pointerDown(end, { button: 0, clientX: 400 })
    fireEvent.pointerMove(end, { clientX: 403 })
    expect(onChange).toHaveBeenLastCalledWith(2000, 4030)
    fireEvent.pointerMove(end, { clientX: 596 })
    expect(onChange).toHaveBeenLastCalledWith(2000, 6000)
  })

  it("takes its colour from the tone", () => {
    const { block } = setup({ variant: "tone", tone: "mint" })
    expect(block).toHaveAttribute("data-variant", "tone")
    expect(block.className).toContain("--tone")
  })

  it("shows grab handles on the clip range", () => {
    const { block } = setup({ variant: "clip" })
    expect(block).toHaveAttribute("data-variant", "clip")
    expect(block.querySelectorAll("[data-edge]")).toHaveLength(2)
  })
})

describe("TimelineBlock across lanes", () => {
  function lanes() {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const onLaneChange = vi.fn()
    const { container } = render(
      <>
        <TimelineTrack
          aria-label="Lane 1"
          durationMs={10_000}
          lane="0"
          group="g"
        >
          <TimelineBlock
            aria-label="Block"
            startMs={2000}
            endMs={4000}
            onChange={onChange}
            onCommit={onCommit}
            onLaneChange={onLaneChange}
          >
            Block
          </TimelineBlock>
        </TimelineTrack>
        <TimelineTrack
          aria-label="Lane 2"
          durationMs={10_000}
          lane="1"
          group="g"
        />
      </>
    )
    const [first, second] = container.querySelectorAll<HTMLElement>(
      "[data-slot=timeline-track]"
    )
    first!.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, bottom: 40 }) as DOMRect
    second!.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 40, bottom: 80 }) as DOMRect
    return {
      onChange,
      onCommit,
      onLaneChange,
      block: screen.getByRole("button", { name: "Block" }),
    }
  }

  it("drops a block on another lane of its group where the pointer is", () => {
    const { block, onCommit, onLaneChange } = lanes()
    fireEvent.pointerDown(block, { button: 0, clientX: 300, clientY: 20 })
    fireEvent.pointerMove(block, { clientX: 500, clientY: 60 })
    expect(block).toHaveAttribute("data-dragging")
    expect(block.style.transform).toBe("translate(200px, 40px)")
    fireEvent.pointerUp(block)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onLaneChange).toHaveBeenCalledWith("1", 4000, 6000)
    expect(block).not.toHaveAttribute("data-dragging")
  })

  it("commits without a lane change when dropped on its own lane", () => {
    const { block, onCommit, onLaneChange } = lanes()
    fireEvent.pointerDown(block, { button: 0, clientX: 300, clientY: 20 })
    fireEvent.pointerMove(block, { clientX: 400, clientY: 25 })
    fireEvent.pointerUp(block)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onLaneChange).not.toHaveBeenCalled()
  })

  it("moves between lanes with Alt and the arrow keys", async () => {
    const { block, onLaneChange } = lanes()
    block.focus()
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}")
    expect(onLaneChange).not.toHaveBeenCalled()
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(onLaneChange).toHaveBeenCalledWith("1", 2000, 4000)
  })
})
