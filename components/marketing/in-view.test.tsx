import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InView } from "./in-view"

type Entry = Pick<
  IntersectionObserverEntry,
  "isIntersecting" | "intersectionRatio"
>
type Report = (entry: Entry) => void

let enter: Report
let leave: Report
let enterOptions: IntersectionObserverInit | undefined

const away: Entry = { isIntersecting: false, intersectionRatio: 0 }
const partly: Entry = { isIntersecting: true, intersectionRatio: 0.1 }
const inside: Entry = { isIntersecting: true, intersectionRatio: 0.6 }

beforeEach(() => {
  Element.prototype.getAnimations = () => []
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: Entry[]) => void,
        init?: IntersectionObserverInit
      ) {
        const report: Report = (entry) => act(() => callback([entry]))
        if (init) {
          enter = report
          enterOptions = init
        } else {
          leave = report
        }
      }
      observe() {}
      disconnect() {}
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

  it("waits off screen and is seen when it is scrolled to", () => {
    render(<InView>stage</InView>)
    const element = screen.getByText("stage")
    expect(enterOptions).toEqual({ rootMargin: "0px 0px -12% 0px" })
    enter(away)
    leave(away)
    expect(element).toHaveAttribute("data-view", "pending")
    leave(partly)
    enter(inside)
    expect(element).toHaveAttribute("data-view", "seen")
  })

  it("waits for the asked amount", () => {
    render(<InView amount={0.4}>stage</InView>)
    const element = screen.getByText("stage")
    expect(enterOptions).toEqual({ threshold: 0.4 })
    enter(partly)
    expect(element).toHaveAttribute("data-view", "pending")
    enter(inside)
    expect(element).toHaveAttribute("data-view", "seen")
  })

  it("keeps playing while part of it is still on screen", () => {
    const animation = { currentTime: 5000 }
    render(<InView amount={0.4}>stage</InView>)
    const element = screen.getByText("stage")
    element.getAnimations = () => [animation as Animation]
    enter(inside)
    enter(partly)
    leave(partly)
    expect(element).toHaveAttribute("data-view", "seen")
    expect(animation.currentTime).toBe(5000)
  })

  it("rewinds and waits again once it is off screen, then plays again", () => {
    const animation = { currentTime: 5000 }
    render(<InView>stage</InView>)
    const element = screen.getByText("stage")
    element.getAnimations = () => [animation as Animation]
    enter(inside)
    leave(away)
    expect(element).toHaveAttribute("data-view", "pending")
    expect(animation.currentTime).toBe(0)
    enter(inside)
    expect(element).toHaveAttribute("data-view", "seen")
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
