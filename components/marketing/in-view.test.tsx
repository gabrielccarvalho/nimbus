import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InView } from "./in-view"

type Entry = Pick<
  IntersectionObserverEntry,
  "isIntersecting" | "intersectionRatio"
> & { boundingClientRect: { top: number } }

let report: (entry: Entry) => void
let options: IntersectionObserverInit | undefined
const disconnect = vi.fn()

const below: Entry = {
  isIntersecting: false,
  intersectionRatio: 0,
  boundingClientRect: { top: 900 },
}
const partly: Entry = { ...below, isIntersecting: true, intersectionRatio: 0.1 }
const inside: Entry = { ...below, isIntersecting: true, intersectionRatio: 0.6 }

beforeEach(() => {
  disconnect.mockClear()
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: Entry[]) => void,
        init?: IntersectionObserverInit
      ) {
        report = (entry) => act(() => callback([entry]))
        options = init
      }
      observe() {}
      disconnect = disconnect
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("InView", () => {
  it("has no state until the observer reports, so nothing waits without it", () => {
    render(<InView>stage</InView>)
    const element = screen.getByText("stage")
    expect(element).toHaveAttribute("data-slot", "in-view")
    expect(element).not.toHaveAttribute("data-view")
  })

  it("waits below the fold and is seen once, for good", () => {
    render(<InView>stage</InView>)
    const element = screen.getByText("stage")
    report(below)
    expect(element).toHaveAttribute("data-view", "pending")
    report(inside)
    expect(element).toHaveAttribute("data-view", "seen")
    expect(disconnect).toHaveBeenCalled()
  })

  it("is seen straight away when the page opens past it", () => {
    render(<InView>stage</InView>)
    report({ ...below, boundingClientRect: { top: -400 } })
    expect(screen.getByText("stage")).toHaveAttribute("data-view", "seen")
  })

  it("waits for the asked amount", () => {
    render(<InView amount={0.4}>stage</InView>)
    expect(options).toEqual({ threshold: [0, 0.4] })
    report(partly)
    expect(screen.getByText("stage")).toHaveAttribute("data-view", "pending")
    report(inside)
    expect(screen.getByText("stage")).toHaveAttribute("data-view", "seen")
  })

  it("replays: rewinds and waits again after it leaves the screen", () => {
    const animation = { currentTime: 5000 }
    render(
      <InView replay amount={0.4}>
        stage
      </InView>
    )
    const element = screen.getByText("stage")
    element.getAnimations = () => [animation as Animation]
    report(inside)
    expect(element).toHaveAttribute("data-view", "seen")
    report(partly)
    expect(element).toHaveAttribute("data-view", "seen")
    expect(animation.currentTime).toBe(5000)
    report(below)
    expect(element).toHaveAttribute("data-view", "pending")
    expect(animation.currentTime).toBe(0)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it("renders as another element and keeps its props", () => {
    render(
      <InView render={<ul />} className="grid" aria-label="Plans">
        <li>Free</li>
      </InView>
    )
    expect(screen.getByRole("list", { name: "Plans" })).toHaveClass("grid")
  })
})
