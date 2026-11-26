import { describe, expect, it } from "vitest"

import {
  firstFreeLane,
  fitInLane,
  laneCount,
  laneGap,
  packLanes,
  placeAtPlayhead,
  placeInLane,
} from "./lanes"

const bounds = { startMs: 0, endMs: 10_000 }
const items = [
  { startMs: 1000, endMs: 2000, lane: 0 },
  { startMs: 4000, endMs: 5000, lane: 0 },
  { startMs: 1500, endMs: 4500, lane: 1 },
]

describe("lanes", () => {
  it("finds the gap around a span in one lane", () => {
    expect(laneGap(items, 0, { startMs: 3000, endMs: 3000 }, bounds)).toEqual({
      startMs: 2000,
      endMs: 4000,
    })
    expect(
      laneGap(items, 0, { startMs: 1500, endMs: 1500 }, bounds)
    ).toBeUndefined()
    expect(laneGap(items, 2, { startMs: 0, endMs: 0 }, bounds)).toEqual(bounds)
  })

  it("moves an item within its lane up to its neighbours", () => {
    expect(
      fitInLane(items, 0, 0, { startMs: 2600, endMs: 3600 }, bounds, {
        moving: true,
        minMs: 100,
      })
    ).toEqual({ startMs: 2600, endMs: 3600 })
    expect(
      fitInLane(items, 0, 0, { startMs: 3500, endMs: 4500 }, bounds, {
        moving: true,
        minMs: 100,
      })
    ).toEqual({ startMs: 3000, endMs: 4000 })
  })

  it("resizes up to the next item", () => {
    expect(
      fitInLane(items, 0, 0, { startMs: 1000, endMs: 6000 }, bounds, {
        moving: false,
        minMs: 100,
      })
    ).toEqual({ startMs: 1000, endMs: 4000 })
  })

  it("drops an item into the free room of another lane", () => {
    expect(
      fitInLane(items, 0, 1, { startMs: 5000, endMs: 6000 }, bounds, {
        moving: true,
        minMs: 100,
      })
    ).toEqual({ startMs: 5000, endMs: 6000 })
    expect(
      fitInLane(items, 0, 1, { startMs: 4000, endMs: 5000 }, bounds, {
        moving: true,
        minMs: 100,
      })
    ).toEqual({ startMs: 4500, endMs: 5500 })
  })

  it("centres a new item on a point and keeps it inside the gap", () => {
    expect(placeInLane(items, 0, bounds, 7000, 1000, 100, "center")).toEqual({
      startMs: 6500,
      endMs: 7500,
    })
    expect(placeInLane(items, 0, bounds, 2100, 1000, 100, "center")).toEqual({
      startMs: 2000,
      endMs: 3000,
    })
    expect(
      placeInLane(items, 0, bounds, 1500, 1000, 100, "center")
    ).toBeUndefined()
  })

  it("places at the playhead on the first lane with room", () => {
    expect(
      placeAtPlayhead(items, bounds, 1800, 1000, { minMs: 100, maxLanes: 3 })
    ).toEqual({ startMs: 1800, endMs: 2800, lane: 2 })
    expect(
      placeAtPlayhead(items, bounds, 2500, 1000, { minMs: 100, maxLanes: 3 })
    ).toEqual({ startMs: 2500, endMs: 3500, lane: 0 })
    expect(
      placeAtPlayhead(items, bounds, 1800, 1000, {
        minMs: 100,
        maxLanes: 3,
        lane: 0,
      })
    ).toBeUndefined()
  })

  it("packs items without a lane into the first lane that is free", () => {
    const packed = packLanes(
      [
        { startMs: 0, endMs: 2000, kind: "zoom" },
        { startMs: 1000, endMs: 1500, kind: "shake" },
        { startMs: 2000, endMs: 3000, kind: "shake" },
        { startMs: 500, endMs: 900, lane: 0, kind: "focus" },
      ],
      4
    )
    expect(packed.map((item) => [item.kind, item.lane])).toEqual([
      ["focus", 0],
      ["shake", 0],
      ["shake", 0],
      ["zoom", 1],
    ])
  })

  it("moves a clash in a stored lane to the next free lane", () => {
    const packed = packLanes(
      [
        { startMs: 0, endMs: 2000, lane: 0 },
        { startMs: 1000, endMs: 3000, lane: 0 },
      ],
      2
    )
    expect(packed).toEqual([
      { startMs: 0, endMs: 2000, lane: 0 },
      { startMs: 1000, endMs: 3000, lane: 1 },
    ])
  })

  it("counts lanes and finds a free one", () => {
    expect(laneCount(items)).toBe(2)
    expect(laneCount([], 1)).toBe(1)
    expect(firstFreeLane(items, { startMs: 1600, endMs: 1700 }, 2)).toBe(
      undefined
    )
    expect(firstFreeLane(items, { startMs: 6000, endMs: 7000 }, 2)).toBe(0)
  })
})
