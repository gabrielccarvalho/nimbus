import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  Timeline,
  TimelineLoudness,
  TimelinePlayhead,
  TimelineRange,
} from "./timeline"

describe("Timeline", () => {
  it("works as a keyboard slider over the duration", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <Timeline
        aria-label="Video timeline"
        durationMs={60_000}
        onValueChange={onValueChange}
      >
        <TimelinePlayhead />
      </Timeline>
    )
    const slider = screen.getByRole("slider", { name: "Video timeline" })
    expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 1:00")
    slider.focus()
    await user.keyboard("{ArrowRight}{Shift>}{ArrowRight}{/Shift}")
    expect(slider).toHaveAttribute("aria-valuenow", "11000")
    await user.keyboard("{End}")
    expect(onValueChange).toHaveBeenLastCalledWith(60_000)
    await user.keyboard("{ArrowRight}{Home}{ArrowLeft}")
    expect(slider).toHaveAttribute("aria-valuenow", "0")
  })

  it("is controlled when given a value", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <Timeline
        aria-label="t"
        durationMs={10_000}
        value={4000}
        onValueChange={onValueChange}
      />
    )
    const slider = screen.getByRole("slider")
    slider.focus()
    await user.keyboard("{ArrowRight}")
    expect(onValueChange).toHaveBeenCalledWith(5000)
    expect(slider).toHaveAttribute("aria-valuenow", "4000")
  })

  it("seeks to the pointer position", () => {
    const onValueChange = vi.fn()
    render(
      <Timeline
        aria-label="t"
        durationMs={10_000}
        onValueChange={onValueChange}
      />
    )
    const slider = screen.getByRole("slider")
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 200,
    } as DOMRect)
    fireEvent.pointerDown(slider, { button: 0, clientX: 150, pointerId: 1 })
    expect(onValueChange).toHaveBeenCalledWith(2500)
  })

  it("renders read-only as an image with positioned ranges", () => {
    const { container } = render(
      <Timeline aria-label="Audio overview" durationMs={20_000} readOnly>
        <TimelineLoudness values={[0, 0.5, 1]} />
        <TimelineRange variant="silence" startMs={4000} endMs={6000} />
      </Timeline>
    )
    expect(
      screen.getByRole("img", { name: "Audio overview" })
    ).not.toHaveAttribute("tabindex")
    const range = container.querySelector<HTMLElement>(
      "[data-slot=timeline-range]"
    )!
    expect(range.style.left).toBe("20%")
    expect(range.style.width).toBe("10%")
    expect(container.querySelector("path")).toHaveAttribute(
      "d",
      "M0,1 L0,1.000 L1,0.500 L2,0.000 L3,1 Z"
    )
  })

  it("draws the audience band along the top with its own opacity", () => {
    const { container } = render(
      <Timeline aria-label="Audio overview" durationMs={20_000} readOnly>
        <TimelineRange
          variant="audience"
          startMs={0}
          endMs={10_000}
          style={{ opacity: 0.4 }}
        />
      </Timeline>
    )
    const band = container.querySelector<HTMLElement>(
      "[data-variant=audience]"
    )!
    expect(band.style.width).toBe("50%")
    expect(band.style.opacity).toBe("0.4")
    expect(band).toHaveClass("h-1.5")
  })
})
