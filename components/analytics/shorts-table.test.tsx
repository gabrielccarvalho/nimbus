import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { ShortRow } from "@/features/analytics/queries"

import { ShortsTable } from "./shorts-table"

function row(over: Partial<ShortRow>): ShortRow {
  return {
    publicationId: "pub",
    origin: "nimbus",
    clipId: "c",
    projectId: "p",
    title: "Clip",
    url: null,
    publishedAt: new Date("2026-11-01T00:00:00Z"),
    ageDays: 10,
    views: null,
    averageViewPercentage: null,
    viewsDay1: null,
    viewsDay7: null,
    viewsDay28: null,
    relative: null,
    early: false,
    curve: [],
    ...over,
  }
}

function titles() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent)
}

describe("ShortsTable", () => {
  it("links the title to the clip and shows views and watched percentage", () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({
            title: "Big jump",
            clipId: "c1",
            projectId: "p1",
            views: 1234,
            averageViewPercentage: 64.2,
          }),
        ]}
      />
    )
    expect(screen.getByRole("link", { name: "Big jump" })).toHaveAttribute(
      "href",
      "/projects/p1/clips/c1"
    )
    expect(screen.getByText("1,234")).toBeInTheDocument()
    expect(screen.getByText("64%")).toBeInTheDocument()
  })

  it("formats relative performance and shows a dash when unknown", () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({ publicationId: "a", title: "A", relative: 2 }),
          row({ publicationId: "b", title: "B", relative: null }),
        ]}
      />
    )
    expect(screen.getByText("2.0× usual")).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("sorts newest first by default", () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({
            publicationId: "a",
            title: "Old",
            publishedAt: new Date("2026-10-01T00:00:00Z"),
          }),
          row({
            publicationId: "b",
            title: "New",
            publishedAt: new Date("2026-11-10T00:00:00Z"),
          }),
        ]}
      />
    )
    expect(titles()).toEqual(["New", "Old"])
  })

  it("sorts by views descending then ascending", async () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({ publicationId: "a", title: "Low", views: 10 }),
          row({ publicationId: "b", title: "High", views: 900 }),
          row({ publicationId: "c", title: "Mid", views: 100 }),
        ]}
      />
    )
    const button = screen.getByRole("button", { name: "Views" })
    await userEvent.click(button)
    expect(titles()).toEqual(["High", "Mid", "Low"])
    expect(button.closest("th")).toHaveAttribute("aria-sort", "descending")
    await userEvent.click(button)
    expect(titles()).toEqual(["Low", "Mid", "High"])
    expect(button.closest("th")).toHaveAttribute("aria-sort", "ascending")
  })

  it("marks imported Shorts and links them to YouTube", () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({
            origin: "imported",
            clipId: null,
            projectId: null,
            title: "Old one",
            url: "https://youtube.com/shorts/abc",
          }),
        ]}
      />
    )
    expect(screen.getByText("Posted outside Nimbus")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Old one" })).toHaveAttribute(
      "href",
      "https://youtube.com/shorts/abc"
    )
  })

  it("shows a dash for a missing day 7 and sorts by it", async () => {
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={() => {}}
        rows={[
          row({ publicationId: "a", title: "None", viewsDay7: null }),
          row({ publicationId: "b", title: "Low", viewsDay7: 5 }),
          row({ publicationId: "c", title: "High", viewsDay7: 50 }),
        ]}
      />
    )
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole("button", { name: "Day 7" }))
    expect(titles()).toEqual(["High", "Low", "None"])
  })

  it("reports the focused row", async () => {
    const onHighlight = vi.fn()
    render(
      <ShortsTable
        highlightedId={null}
        onHighlight={onHighlight}
        rows={[row({ publicationId: "a", title: "A" })]}
      />
    )
    screen.getAllByRole("row")[1]!.focus()
    expect(onHighlight).toHaveBeenCalledWith("a")
  })
})
