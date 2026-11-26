import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { Segmented, SegmentedItem } from "./segmented"

describe("Segmented", () => {
  it("presses the chosen item and reports the value", async () => {
    const onValueChange = vi.fn()
    render(
      <Segmented
        aria-label="Mode"
        defaultValue={["split"]}
        onValueChange={onValueChange}
      >
        <SegmentedItem value="split">Split</SegmentedItem>
        <SegmentedItem value="fill">Fill</SegmentedItem>
      </Segmented>
    )
    const group = screen.getByRole("group", { name: "Mode" })
    expect(group).toHaveAttribute("data-slot", "segmented")
    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await userEvent.click(screen.getByRole("button", { name: "Fill" }))
    expect(onValueChange.mock.calls[0]![0]).toEqual(["fill"])
    expect(screen.getByRole("button", { name: "Fill" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("clears the value when the pressed item is clicked again", async () => {
    const onValueChange = vi.fn()
    render(
      <Segmented
        aria-label="Decision"
        defaultValue={["approve"]}
        onValueChange={onValueChange}
      >
        <SegmentedItem value="reject">Reject</SegmentedItem>
        <SegmentedItem value="approve">Approve</SegmentedItem>
      </Segmented>
    )
    await userEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onValueChange.mock.calls[0]![0]).toEqual([])
  })

  it("is controlled when given a value", async () => {
    function Controlled() {
      const [value, setValue] = React.useState(["a"])
      return (
        <Segmented
          aria-label="Ease"
          value={value}
          onValueChange={(next) => next.length && setValue(next)}
        >
          <SegmentedItem value="a">Smooth</SegmentedItem>
          <SegmentedItem value="b">Snap</SegmentedItem>
        </Segmented>
      )
    }
    render(<Controlled />)
    await userEvent.click(screen.getByRole("button", { name: "Smooth" }))
    expect(screen.getByRole("button", { name: "Smooth" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("moves between items with the arrow keys", async () => {
    render(
      <Segmented aria-label="Mode" defaultValue={["a"]}>
        <SegmentedItem value="a">One</SegmentedItem>
        <SegmentedItem value="b">Two</SegmentedItem>
      </Segmented>
    )
    await userEvent.tab()
    expect(screen.getByRole("button", { name: "One" })).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByRole("button", { name: "Two" })).toHaveFocus()
  })

  it("stretches its items in the fill layout and merges className", () => {
    render(
      <Segmented aria-label="Tabs" layout="fill" className="extra">
        <SegmentedItem value="a" className="item-extra">
          One
        </SegmentedItem>
      </Segmented>
    )
    const group = screen.getByRole("group", { name: "Tabs" })
    expect(group).toHaveAttribute("data-layout", "fill")
    expect(group).toHaveClass("w-full", "extra")
    expect(screen.getByRole("button", { name: "One" })).toHaveClass(
      "item-extra"
    )
  })

  it("disables every item with the group", () => {
    render(
      <Segmented aria-label="Mode" disabled>
        <SegmentedItem value="a">One</SegmentedItem>
      </Segmented>
    )
    expect(screen.getByRole("button", { name: "One" })).toBeDisabled()
  })
})
