import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  CropRegion,
  CropRegionEditor,
  moveRect,
  resizeRect,
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
