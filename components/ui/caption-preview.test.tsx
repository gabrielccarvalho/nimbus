import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  CaptionPreview,
  CaptionPreviewOverlay,
  CaptionPreviewText,
} from "./caption-preview"

const pages = [
  {
    startMs: 0,
    endMs: 1000,
    lines: [2, 1],
    words: [
      { text: "wait", startMs: 0, endMs: 300 },
      { text: "what", startMs: 300, endMs: 600 },
      { text: "happened", startMs: 600, endMs: 1000 },
    ],
  },
]

const captionStyle = {
  fontFamily: "sans-serif",
  fontSize: 90,
  uppercase: true,
  color: "rgb(255 255 255 / 1)",
  highlightColor: "rgb(154 230 0 / 1)",
  outlineColor: "rgb(10 10 10 / 1)",
  outline: 6,
  box: false,
  highlight: true,
}

function renderAt(currentMs: number, style = captionStyle) {
  return render(
    <CaptionPreview data-testid="frame">
      <CaptionPreviewText
        pages={pages}
        currentMs={currentMs}
        captionStyle={style}
        baseline={0.72}
      />
    </CaptionPreview>
  )
}

describe("CaptionPreview", () => {
  it("shows the page at the current time with the active word highlighted", () => {
    const { container } = renderAt(450)
    expect(screen.getByTestId("frame")).toHaveTextContent("WAIT WHATHAPPENED")
    const lines = container.querySelectorAll("[data-slot=caption-preview-line]")
    expect(lines).toHaveLength(2)
    const active = container.querySelector("[data-active]")
    expect(active).toHaveTextContent("WHAT")
    expect(active).toHaveStyle({ color: "rgb(154 230 0 / 1)" })
  })

  it("is empty between pages and scales the font to the frame", () => {
    const { container } = renderAt(1500)
    const text = container.querySelector<HTMLElement>(
      "[data-slot=caption-preview-text]"
    )!
    expect(text).toBeEmptyDOMElement()
    expect(text.style.fontSize).toBe("calc(8.33333cqw)")
    expect(text.style.top).toBe("72%")
  })

  it("supports boxed captions without highlighting", () => {
    const { container } = renderAt(100, {
      ...captionStyle,
      box: true,
      highlight: false,
      uppercase: false,
    })
    expect(container.querySelector("[data-active]")).toBeNull()
    const line = container.querySelector<HTMLElement>(
      "[data-slot=caption-preview-line]"
    )!
    expect(line.style.background).toBe("rgb(10, 10, 10)")
    expect(line).toHaveTextContent("wait what")
  })
})

describe("CaptionPreviewText placement", () => {
  it("is a vertical slider only when it can be moved", () => {
    renderAt(0)
    expect(screen.queryByRole("slider")).toBeNull()

    const onBaselineChange = vi.fn()
    render(
      <CaptionPreview>
        <CaptionPreviewText
          aria-label="Caption position"
          pages={pages}
          currentMs={0}
          captionStyle={captionStyle}
          baseline={0.5}
          onBaselineChange={onBaselineChange}
        />
      </CaptionPreview>
    )
    const slider = screen.getByRole("slider", { name: "Caption position" })
    expect(slider).toHaveAttribute("aria-orientation", "vertical")
    expect(slider).toHaveAttribute("aria-valuenow", "50")
    expect(slider).toHaveAttribute("aria-valuetext", "50% from the top")

    fireEvent.keyDown(slider, { key: "ArrowUp" })
    expect(onBaselineChange).toHaveBeenLastCalledWith(0.49)
    fireEvent.keyDown(slider, { key: "ArrowDown", shiftKey: true })
    expect(onBaselineChange).toHaveBeenLastCalledWith(0.55)
    fireEvent.keyDown(slider, { key: "Home" })
    expect(onBaselineChange).toHaveBeenLastCalledWith(0.1)
    fireEvent.keyDown(slider, { key: "End" })
    expect(onBaselineChange).toHaveBeenLastCalledWith(0.95)
    fireEvent.keyDown(slider, { key: "a" })
    expect(onBaselineChange).toHaveBeenCalledTimes(4)
  })
})

describe("CaptionPreviewOverlay", () => {
  const renderOverlay = (position: "top" | "center") =>
    render(
      <CaptionPreview>
        <CaptionPreviewOverlay
          text="Wait for the jump"
          position={position}
          fontFamily="sans-serif"
          fontSize={108}
          color="rgb(10 10 10 / 1)"
          outlineColor="rgb(255 255 255 / 1)"
        />
      </CaptionPreview>
    ).container.querySelector<HTMLElement>(
      "[data-slot=caption-preview-overlay]"
    )!

  it("sits 240 of 1920 units from the top, balanced inside the side margins", () => {
    const overlay = renderOverlay("top")
    expect(overlay).toHaveTextContent("Wait for the jump")
    expect(overlay.style.top).toBe("12.5%")
    expect(overlay.style.fontSize).toBe("calc(10cqw)")
    expect(overlay.style.left).toBe("calc(8.33333cqw)")
    expect(overlay.style.right).toBe("calc(8.33333cqw)")
    expect(overlay).toHaveClass("text-balance")
    expect(overlay).not.toHaveClass("-translate-y-1/2")
  })

  it("centres on the frame", () => {
    const overlay = renderOverlay("center")
    expect(overlay.style.top).toBe("50%")
    expect(overlay).toHaveClass("-translate-y-1/2")
  })
})
