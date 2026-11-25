import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { getAnalyticsOverview } from "@/features/analytics/queries"

import { Overview } from "./overview"

vi.mock("next/navigation", () => ({ usePathname: () => "/analytics" }))

type Props = Awaited<ReturnType<typeof getAnalyticsOverview>>

const totals = {
  views: 11_200,
  watchHours: 41.26,
  netSubscribers: 12,
  averageViewDurationS: 75,
  likes: 340,
}

function props(over: Partial<Props> = {}): Props {
  return {
    dataThrough: "2026-11-21",
    split: true,
    summary: {
      current: totals,
      previous: { ...totals, views: 8_960 },
      change: {
        views: 0.25,
        watchHours: null,
        netSubscribers: null,
        averageViewDurationS: null,
        likes: null,
      },
    },
    series: [
      { day: "2026-11-20", shorts: 5_000, long: 1_000, other: 200 },
      { day: "2026-11-21", shorts: 3_400, long: 1_600, other: 0 },
    ],
    topShorts: [],
    syncing: false,
    ...over,
  }
}

function tile(label: string) {
  return screen.getByText(label).closest("[data-slot=stat-card]") as HTMLElement
}

describe("Overview", () => {
  it("shows the five tiles with their change", () => {
    render(<Overview {...props()} period={28} />)
    expect(within(tile("Views")).getByText("11,200")).toBeInTheDocument()
    expect(within(tile("Views")).getByText("+25%")).toBeInTheDocument()
    expect(within(tile("Watch hours")).getByText("41.3")).toBeInTheDocument()
    expect(within(tile("Watch hours")).getByText("—")).toBeInTheDocument()
    expect(within(tile("Net subscribers")).getByText("12")).toBeInTheDocument()
    expect(
      within(tile("Average view duration")).getByText("1:15")
    ).toBeInTheDocument()
    expect(within(tile("Likes")).getByText("340")).toBeInTheDocument()
  })

  it("says how fresh the data is", () => {
    render(<Overview {...props()} period={28} />)
    expect(screen.getByText(/Data through Nov 21, 2026/)).toHaveTextContent(
      "YouTube shares numbers 2–3 days late."
    )
  })

  it("marks the chosen period", () => {
    render(<Overview {...props()} period={28} />)
    expect(screen.getByRole("link", { name: "28 days" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByRole("link", { name: "7 days" })).toHaveAttribute(
      "href",
      "/analytics?period=7"
    )
    expect(screen.getByRole("link", { name: "7 days" })).not.toHaveAttribute(
      "aria-current"
    )
  })

  it("summarises the split and offers the numbers as a table", () => {
    render(<Overview {...props()} period={28} />)
    expect(
      screen.getByText(
        "11,200 views in the last 28 days: 8,400 from Shorts, 2,800 from long-form."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Show as table")).toBeInTheDocument()
    const table = screen.getByRole("table", { hidden: true })
    expect(
      within(table).getAllByRole("columnheader", { hidden: true })
    ).toHaveLength(3)
  })

  it("uses a single series when nothing is split", () => {
    render(<Overview {...props({ split: false })} period={28} />)
    expect(
      screen.getByText("11,200 views in the last 28 days.")
    ).toBeInTheDocument()
    const table = screen.getByRole("table", { hidden: true })
    expect(
      within(table).getAllByRole("columnheader", { hidden: true })
    ).toHaveLength(2)
  })

  it("lists top Shorts and links each to its clip or YouTube", () => {
    render(
      <Overview
        {...props({
          topShorts: [
            {
              publicationId: "a",
              title: "Big jump",
              clipId: "c1",
              projectId: "p1",
              url: "https://youtu.be/a",
              views: 1_234,
            },
            {
              publicationId: "b",
              title: "Old upload",
              clipId: null,
              projectId: null,
              url: "https://youtu.be/b",
              views: 90,
            },
          ],
        })}
        period={28}
      />
    )
    expect(screen.getByText("Top Shorts this period")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Big jump" })).toHaveAttribute(
      "href",
      "/projects/p1/clips/c1"
    )
    expect(screen.getByRole("link", { name: "Old upload" })).toHaveAttribute(
      "href",
      "https://youtu.be/b"
    )
    expect(screen.getByText("+1,234 views")).toBeInTheDocument()
  })

  it("says what is going on when there is no summary", () => {
    const empty = props({ summary: null, series: [], dataThrough: null })
    const { rerender } = render(<Overview {...empty} syncing period={28} />)
    expect(
      screen.getByText("Fetching your channel's numbers from YouTube…")
    ).toBeInTheDocument()
    rerender(<Overview {...empty} syncing={false} period={28} />)
    expect(screen.getByText("No views in this period yet.")).toBeInTheDocument()
  })
})
