import { describe, expect, it } from "vitest"

import {
  addDays,
  cumulativeViews,
  daysBetween,
  dailySeries,
  medianCurve,
  periodSummary,
  periodWindow,
  relativePerformance,
} from "./curves"
import type { ChannelDay } from "./schema"

describe("day math", () => {
  it("adds and counts days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01")
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31")
    expect(daysBetween("2026-10-25", "2026-11-21")).toBe(27)
  })
})

describe("cumulativeViews", () => {
  it("accumulates from the publish day, missing days as 0", () =>
    expect(
      cumulativeViews(
        [
          { day: "2026-11-01", views: 10 },
          { day: "2026-11-03", views: 5 },
        ],
        "2026-11-01",
        "2026-11-04"
      )
    ).toEqual([10, 10, 15, 15]))
  it("caps the curve at day 28", () =>
    expect(cumulativeViews([], "2026-10-01", "2026-11-20")).toHaveLength(29))
  it("is empty when the data ends before the publish day", () =>
    expect(cumulativeViews([], "2026-11-20", "2026-11-19")).toEqual([]))
})

const c = (publicationId: string, cumulative: number[]) => ({
  publicationId,
  cumulative,
})
const peers = [
  c("a", [10, 20, 40, 50]),
  c("b", [10, 30, 60]),
  c("c", [5, 10, 80, 90]),
  c("d", [1, 2]),
]

describe("relativePerformance", () => {
  it("compares cumulative views with peers at the same age", () =>
    expect(relativePerformance(c("t", [50, 80, 120]), peers)).toBe(2))
  it("needs three peers old enough", () =>
    expect(
      relativePerformance(c("a", [10, 20, 40, 50]), [
        ...peers,
        c("e", [0, 0, 0, 0]),
      ])
    ).toBeNull())
  it("needs two days of age", () =>
    expect(relativePerformance(c("t", [50, 80]), peers)).toBeNull())
  it("needs three peers", () =>
    expect(
      relativePerformance(c("t", [50, 80, 120]), peers.slice(0, 2))
    ).toBeNull())
  it("ignores the target among its peers", () =>
    expect(
      relativePerformance(c("a", [10, 20, 40]), [
        c("a", [999, 999, 999]),
        c("b", [10, 30, 20]),
        c("c", [5, 10, 20]),
        c("d", [1, 2, 20]),
      ])
    ).toBe(2))
  it("is null when peers have no views", () =>
    expect(
      relativePerformance(c("t", [1, 2, 3]), [
        c("a", [0, 0, 0]),
        c("b", [0, 0, 0]),
        c("c", [0, 0, 0]),
      ])
    ).toBeNull())
})

describe("medianCurve", () => {
  it("needs three curves for a day", () =>
    expect(
      medianCurve([
        [1, 2, 3],
        [3, 4],
        [5, 6, 7],
      ])
    ).toEqual([3, 4, null]))
})

describe("periodWindow", () => {
  it("ends on the given day and precedes itself with an equal span", () =>
    expect(periodWindow(28, "2026-11-21")).toEqual({
      from: "2026-10-25",
      to: "2026-11-21",
      previousFrom: "2026-09-27",
      previousTo: "2026-10-24",
    }))
})

const row = (over: Partial<ChannelDay>): ChannelDay => ({
  day: "2026-11-10",
  contentType: "shorts",
  views: 0,
  estimatedMinutesWatched: 0,
  averageViewDurationS: null,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  ...over,
})

describe("periodSummary", () => {
  const window = periodWindow(7, "2026-11-10")
  const current = [
    row({
      day: "2026-11-08",
      views: 300,
      estimatedMinutesWatched: 60,
      averageViewDurationS: 12,
      subscribersGained: 5,
      subscribersLost: 1,
    }),
    row({
      day: "2026-11-09",
      contentType: "long",
      views: 100,
      estimatedMinutesWatched: 400,
      averageViewDurationS: 240,
    }),
  ]

  it("sums the window and weights average view duration by views", () => {
    const { current: totals, change } = periodSummary(current, window)
    expect(totals.views).toBe(400)
    expect(totals.watchHours).toBeCloseTo(460 / 60)
    expect(totals.netSubscribers).toBe(4)
    expect(totals.averageViewDurationS).toBeCloseTo(
      (300 * 12 + 100 * 240) / 400
    )
    expect(Object.values(change).every((v) => v === null)).toBe(true)
  })

  it("sums several days and content types", () => {
    const days = [
      row({
        day: "2026-11-08",
        views: 300,
        estimatedMinutesWatched: 60,
        averageViewDurationS: 12,
        subscribersGained: 5,
        subscribersLost: 1,
      }),
      row({
        day: "2026-11-09",
        views: 300,
        estimatedMinutesWatched: 60,
        averageViewDurationS: 12,
        subscribersGained: 5,
        subscribersLost: 1,
      }),
      row({
        day: "2026-11-09",
        contentType: "long",
        views: 100,
        estimatedMinutesWatched: 400,
        averageViewDurationS: 240,
      }),
    ]
    const { current: totals } = periodSummary(days, window)
    expect(totals.views).toBe(700)
    expect(totals.watchHours).toBeCloseTo(520 / 60)
    expect(totals.netSubscribers).toBe(8)
    expect(totals.averageViewDurationS).toBeCloseTo(
      (300 * 12 * 2 + 100 * 240) / 700
    )
  })

  it("reports change against the previous period", () => {
    const { change } = periodSummary(
      [...current, row({ day: "2026-11-02", views: 200 })],
      window
    )
    expect(change.views).toBe(1)
  })

  it("gives null average duration without views", () =>
    expect(periodSummary([], window).current.averageViewDurationS).toBeNull())
})

describe("dailySeries", () => {
  it("fills every day and sums per content type", () =>
    expect(
      dailySeries(
        [
          row({ day: "2026-11-02", views: 5 }),
          row({ day: "2026-11-02", views: 2 }),
          row({ day: "2026-11-02", contentType: "long", views: 7 }),
        ],
        "2026-11-01",
        "2026-11-03"
      )
    ).toEqual([
      { day: "2026-11-01", shorts: 0, long: 0, other: 0 },
      { day: "2026-11-02", shorts: 7, long: 7, other: 0 },
      { day: "2026-11-03", shorts: 0, long: 0, other: 0 },
    ]))
})
