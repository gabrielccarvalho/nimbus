import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CaptionPreview, CaptionPreviewText } from "./caption-preview"

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
