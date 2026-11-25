import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ShortRow } from "@/features/analytics/queries"

import { GrowthChart } from "./growth-chart"

function row(id: string, title: string, publishedAt?: Date): ShortRow {
  return {
    publicationId: id,
    origin: "nimbus",
    clipId: id,
    projectId: "p",
    title,
    url: null,
    publishedAt: publishedAt ?? new Date("2026-11-01T00:00:00Z"),
    ageDays: 10,
    views: null,
    averageViewPercentage: null,
    viewsDay1: null,
    viewsDay7: null,
    viewsDay28: null,
    relative: null,
    early: false,
    curve: [0, 10, 20, 30, 40, 50, 60, 70],
  }
}

const rows = [
  row("a", "Past short one"),
  row("b", "Past short two"),
  row("c", "Past short three"),
]
const median = [0, 100, 200, 400, 600, 800, 1000, 1200]

describe("GrowthChart", () => {
  it("summarises the channel median", () => {
    render(<GrowthChart rows={rows} median={median} highlightedId={null} />)
    expect(
      screen.getByText(
        "Growth since upload for 3 Shorts. The channel median reaches 1,200 views by day 7."
      )
    ).toBeInTheDocument()
  })

  it("names the highlighted Short in a live region", () => {
    render(<GrowthChart rows={rows} median={median} highlightedId="a" />)
    const live = screen.getByText("Highlighted: Past short one")
    expect(live).toHaveAttribute("aria-live", "polite")
  })

  it("offers the data as a table", () => {
    render(<GrowthChart rows={rows} median={median} highlightedId={null} />)
    expect(
      screen.getByRole("rowheader", { name: "Past short two" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Day 7" })
    ).toBeInTheDocument()
    const rowOne = screen
      .getByRole("rowheader", { name: "Past short one" })
      .closest("tr")!
    expect(within(rowOne).getByText("70")).toBeInTheDocument()
  })

  it("tables every Short even when the chart draws only the recent ones", () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      row(`m${i}`, `Short ${i}`, new Date(Date.UTC(2026, 0, 1 + i)))
    )
    render(<GrowthChart rows={many} median={median} highlightedId="m0" />)
    expect(screen.getAllByRole("rowheader")).toHaveLength(36)
  })
})
