import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Sparkline } from "./sparkline"

describe("Sparkline", () => {
  it("draws a polyline scaled to the box with an accessible name", () => {
    render(<Sparkline values={[1, 0.5, 0]} label="Retention" />)
    const chart = screen.getByRole("img", { name: "Retention" })
    expect(chart.querySelector("polyline")).toHaveAttribute(
      "points",
      "0,0 50,16 100,32"
    )
  })

  it("scales to the highest value when it exceeds 1", () => {
    render(<Sparkline values={[2, 1]} label="Retention" />)
    expect(screen.getByRole("img").querySelector("polyline")).toHaveAttribute(
      "points",
      "0,0 100,16"
    )
  })

  it("draws markers as vertical ticks at their fraction", () => {
    render(<Sparkline values={[1, 1]} markers={[0.25, 0.75]} label="Chart" />)
    const ticks = screen.getByRole("img").querySelectorAll("line")
    expect([...ticks].map((t) => t.getAttribute("x1"))).toEqual(["25", "75"])
  })

  it("renders nothing to plot for fewer than two values", () => {
    render(<Sparkline values={[1]} label="Chart" className="extra" />)
    const chart = screen.getByRole("img")
    expect(chart.querySelector("polyline")).toBeNull()
    expect(chart).toHaveClass("extra")
  })
})
