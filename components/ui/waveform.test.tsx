import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Waveform } from "./waveform"

function peaks(container: HTMLElement) {
  const d = container.querySelector("path")!.getAttribute("d")!
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
  return ys.slice(1, ys.length / 2 - 1).map((y) => Math.round((50 - y) * 2))
}

describe("Waveform", () => {
  it("draws the level at each value, scaled by the gain", () => {
    const { container, rerender } = render(<Waveform values={[0.2, 0.8]} />)
    expect(peaks(container)).toEqual([20, 80])
    rerender(<Waveform values={[0.2, 0.8]} gain={0.5} />)
    expect(peaks(container)).toEqual([10, 40])
  })

  it("keeps a sliver when silent and stays inside the box when loud", () => {
    const { container } = render(<Waveform values={[0, 1]} gain={2} />)
    expect(peaks(container)).toEqual([2, 100])
  })

  it("draws nothing without values", () => {
    const { container } = render(<Waveform values={[]} />)
    expect(container.querySelector("path")).toBeNull()
  })
})
