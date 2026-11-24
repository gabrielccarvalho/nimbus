import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DotMeter } from "./dot-meter"
import { SignalDot } from "./signal-dot"
import { StatusPill } from "./status-pill"

describe("StatusPill", () => {
  it("renders its label with the tone and merges className", () => {
    render(
      <StatusPill tone="amber" className="extra">
        Needs you
      </StatusPill>
    )
    const pill = screen.getByText("Needs you")
    expect(pill).toHaveAttribute("data-slot", "status-pill")
    expect(pill).toHaveAttribute("data-tone", "amber")
    expect(pill).toHaveClass("extra")
  })

  it("renders as another element", () => {
    render(
      <StatusPill tone="sky" render={<a href="/x" />}>
        Exported
      </StatusPill>
    )
    expect(screen.getByRole("link", { name: "Exported" })).toHaveAttribute(
      "data-slot",
      "status-pill"
    )
  })
})

describe("SignalDot", () => {
  it("is decorative unless labelled", () => {
    const { container } = render(<SignalDot tone="lav" />)
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true")
  })

  it("exposes a label and the lit state", () => {
    render(<SignalDot tone="amber" lit label="Needs you" />)
    const dot = screen.getByRole("img", { name: "Needs you" })
    expect(dot).toHaveAttribute("data-lit", "true")
    expect(dot).toHaveAttribute("data-tone", "amber")
  })
})

describe("DotMeter", () => {
  it("lights dots in proportion to value / max", () => {
    render(<DotMeter value={142} max={300} aria-label="Render minutes" />)
    const meter = screen.getByRole("meter", { name: "Render minutes" })
    expect(meter).toHaveAttribute("aria-valuenow", "142")
    expect(meter.querySelectorAll("[data-on]")).toHaveLength(5)
  })

  it("clamps to the range", () => {
    render(<DotMeter value={500} max={300} aria-label="Over" />)
    expect(
      screen.getByRole("meter", { name: "Over" }).querySelectorAll("[data-on]")
    ).toHaveLength(10)
  })
})
