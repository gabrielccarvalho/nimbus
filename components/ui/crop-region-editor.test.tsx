import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  CropRegion,
  CropRegionEditor,
  moveRect,
  resizeRect,
  resizeRectLocked,
} from "./crop-region-editor"

const rect = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }

describe("CropRegionEditor", () => {
  it("nudges with arrows, Shift for big steps and Alt to resize", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <CropRegionEditor defaultValue={rect} onValueChange={onValueChange}>
        <CropRegion aria-label="Webcam" />
      </CropRegionEditor>
    )
    const region = screen.getByRole("group", { name: "Webcam" })
    region.focus()
    await user.keyboard("{ArrowRight}")
    expect(onValueChange).toHaveBeenLastCalledWith({ ...rect, x: 0.505 })
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}")
    expect(onValueChange.mock.calls.at(-1)![0].y).toBeCloseTo(0.45)
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}")
    expect(onValueChange.mock.calls.at(-1)![0].w).toBeCloseTo(0.205)
    expect(region).toHaveAccessibleDescription(
      /Left 50.5%, top 45%, 20.5% wide/
    )
  })

  it("is controlled when given a value", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <CropRegionEditor value={rect} onValueChange={onValueChange}>
        <CropRegion />
      </CropRegionEditor>
    )
    const region = screen.getByRole("group", { name: "Crop region" })
    region.focus()
    await user.keyboard("{ArrowLeft}")
    expect(onValueChange).toHaveBeenCalledWith({ ...rect, x: 0.495 })
    expect(region.style.left).toBe("50%")
  })

  it("drags to move and resize from a corner", () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <CropRegionEditor defaultValue={rect} onValueChange={onValueChange}>
        <CropRegion />
      </CropRegionEditor>
    )
    const frame = container.querySelector<HTMLElement>(
      "[data-slot=crop-region-editor]"
    )!
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    const region = screen.getByRole("group")
    fireEvent.pointerDown(region, { button: 0, clientX: 110, clientY: 60 })
    fireEvent.pointerMove(region, { clientX: 130, clientY: 70 })
    fireEvent.pointerUp(region)
    expect(onValueChange.mock.calls.at(-1)![0]).toMatchObject({
      x: 0.6,
      y: 0.6,
    })

    const handle = container.querySelector<HTMLElement>("[data-corner=nw]")!
    fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 60 })
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 50 })
    const resized = onValueChange.mock.calls.at(-1)![0]
    expect(resized.x).toBeCloseTo(0.5)
    expect(resized.w).toBeCloseTo(0.3)
    expect(resized.y).toBeCloseTo(0.5)
    expect(resized.h).toBeCloseTo(0.3)
  })

  it("ignores input when disabled", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { container } = render(
      <CropRegionEditor
        defaultValue={rect}
        onValueChange={onValueChange}
        disabled
      >
        <CropRegion />
      </CropRegionEditor>
    )
    const region = screen.getByRole("group")
    expect(region).toHaveAttribute("tabindex", "-1")
    region.focus()
    await user.keyboard("{ArrowRight}")
    expect(onValueChange).not.toHaveBeenCalled()
    expect(container.querySelector("[data-slot=crop-region-handle]")).toBeNull()
  })
})

function setup(frameW: number, frameH: number, ui: React.ReactElement) {
  const view = render(ui)
  view.container.querySelector<HTMLElement>(
    "[data-slot=crop-region-editor]"
  )!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: frameW, height: frameH }) as DOMRect
  return view
}

describe("multi-region and aspect lock", () => {
  const start = { x: 0.3, y: 0.3, w: 0.2, h: 0.4 }
  const aspect = 1
  const pixelAspect = (r: { w: number; h: number }) => (r.w * 200) / (r.h * 100)

  it.each([
    ["nw", 100, 50, -20, -10],
    ["ne", 100, 50, 20, -10],
    ["sw", 100, 50, -20, 10],
    ["se", 100, 50, 20, 10],
  ])("keeps the ratio when resizing the %s corner", (corner, x, y, dx, dy) => {
    const onValueChange = vi.fn()
    const { container } = setup(
      200,
      100,
      <CropRegionEditor defaultValue={start}>
        <CropRegion
          value={start}
          onValueChange={onValueChange}
          aspectRatio={aspect}
        />
      </CropRegionEditor>
    )
    const handle = container.querySelector<HTMLElement>(
      `[data-corner=${corner}]`
    )!
    fireEvent.pointerDown(handle, { button: 0, clientX: x, clientY: y })
    fireEvent.pointerMove(handle, { clientX: x + dx, clientY: y + dy })
    const next = onValueChange.mock.calls.at(-1)![0]
    expect(pixelAspect(next)).toBeCloseTo(aspect)
    expect(next.w).not.toBeCloseTo(start.w)
  })

  it("keeps the ratio on Alt+arrow", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    setup(
      200,
      100,
      <CropRegionEditor defaultValue={start}>
        <CropRegion
          value={{ x: 0.3, y: 0.3, w: 0.2, h: 0.4 }}
          onValueChange={onValueChange}
          aspectRatio={aspect}
        />
      </CropRegionEditor>
    )
    screen.getByRole("group").focus()
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}")
    expect(pixelAspect(onValueChange.mock.calls.at(-1)![0])).toBeCloseTo(aspect)
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(pixelAspect(onValueChange.mock.calls.at(-1)![0])).toBeCloseTo(aspect)
  })

  it("moves a second controlled region independently", async () => {
    const user = userEvent.setup()
    const first = vi.fn()
    const second = vi.fn()
    const other = { x: 0.5, y: 0.1, w: 0.2, h: 0.2 }
    render(
      <CropRegionEditor value={rect} onValueChange={first}>
        <CropRegion aria-label="Webcam" />
        <CropRegion
          aria-label="Gameplay"
          value={other}
          onValueChange={second}
        />
      </CropRegionEditor>
    )
    screen.getByRole("group", { name: "Gameplay" }).focus()
    await user.keyboard("{ArrowRight}")
    expect(second.mock.calls[0]![0].x).toBeCloseTo(0.505)
    expect(first).not.toHaveBeenCalled()
    expect(screen.getByRole("group", { name: "Webcam" }).style.left).toBe("50%")
  })

  it("treats a controlled region without a handler as read-only", async () => {
    const user = userEvent.setup()
    const first = vi.fn()
    render(
      <CropRegionEditor value={rect} onValueChange={first}>
        <CropRegion aria-label="Gameplay" value={start} />
      </CropRegionEditor>
    )
    screen.getByRole("group", { name: "Gameplay" }).focus()
    await user.keyboard("{ArrowRight}")
    expect(first).not.toHaveBeenCalled()
  })

  it("snaps a start rect that is off the ratio", () => {
    const next = resizeRectLocked(
      { x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
      "se",
      0,
      0,
      1
    )
    expect(next.w / next.h).toBeCloseTo(1)
  })

  it("moves without drifting in size", () => {
    let next = { x: 0.3, y: 0.3, w: 0.2, h: 0.4 }
    for (let i = 0; i < 40; i++) {
      next = moveRect(next, i % 2 ? -0.005 : 0.005, 0)
    }
    expect(next.x).toBeCloseTo(0.3)
    expect([next.w, next.h]).toEqual([0.2, 0.4])
  })

  it("clamps locked resizes to the frame", () => {
    const next = resizeRectLocked(
      { x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
      "se",
      0.9,
      0.9,
      1
    )
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9)
    expect(next.w / next.h).toBeCloseTo(1)
  })
})

describe("rect math", () => {
  it("keeps rects inside the frame and above the minimum size", () => {
    expect(moveRect(rect, 0.5, -1)).toEqual({ ...rect, x: 0.8, y: 0 })
    expect(resizeRect(rect, "se", 1, 1)).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    })
    const tiny = resizeRect(rect, "nw", 1, 1)
    expect(tiny.w).toBeCloseTo(0.05)
    expect(tiny.x).toBeCloseTo(0.65)
  })
})
