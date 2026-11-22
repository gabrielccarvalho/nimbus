import { describe, expect, it } from "vitest"

import { findActiveIndex } from "./lookup"

const items = [
  { startMs: 0, endMs: 100 },
  { startMs: 150, endMs: 300 },
  { startMs: 300, endMs: 500 },
]

describe("findActiveIndex", () => {
  it.each([
    [0, 0],
    [99, 0],
    [100, -1],
    [150, 1],
    [300, 2],
    [499, 2],
    [500, -1],
    [-1, -1],
  ])("at %ims returns %i", (ms, expected) => {
    expect(findActiveIndex(items, ms)).toBe(expected)
  })

  it("handles empty lists", () => {
    expect(findActiveIndex([], 10)).toBe(-1)
  })
})
