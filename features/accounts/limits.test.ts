import { describe, expect, it } from "vitest"

import { assertRenderFits, assertStorageFits, claudeRunsError } from "./limits"
import { PLANS } from "./schema"

const GB = 1024 ** 3

describe("render minutes", () => {
  it("lets a render through while it fits in the month", () => {
    expect(() => assertRenderFits(PLANS.free, 0, 60 * 60)).not.toThrow()
    expect(() => assertRenderFits(PLANS.free, 59 * 60, 60)).not.toThrow()
  })

  it("refuses once the month is used", () => {
    expect(() => assertRenderFits(PLANS.free, 60 * 60, 0)).toThrow(
      "You've used your plan's 60 render minutes for this month"
    )
    expect(() => assertRenderFits(PLANS.creator, 301 * 60, 30)).toThrow(
      "You've used your plan's 300 render minutes for this month"
    )
  })

  it("refuses a render longer than what's left, and says how much is left", () => {
    expect(() => assertRenderFits(PLANS.free, 55 * 60, 12 * 60 + 1)).toThrow(
      "Rendering this takes about 13 min and your plan has 5 min left this month"
    )
  })

  it("never refuses a plan with no limit", () => {
    expect(() => assertRenderFits(PLANS.admin, 1e9, 1e9)).not.toThrow()
  })
})

describe("storage", () => {
  it("lets a file through while it fits", () => {
    expect(() => assertStorageFits(PLANS.free, 20 * GB, 5 * GB)).not.toThrow()
  })

  it("refuses a file that doesn't fit in what's left", () => {
    expect(() => assertStorageFits(PLANS.free, 20 * GB, 5 * GB + 1)).toThrow(
      "This file doesn't fit in what's left of your plan's 25 GB of storage"
    )
  })

  it("refuses anything once storage is full", () => {
    expect(() => assertStorageFits(PLANS.creator, 100 * GB, 0)).toThrow(
      "Your plan's 100 GB of storage is full. Delete a project to make room."
    )
  })

  it("never refuses a plan with no limit", () => {
    expect(() => assertStorageFits(PLANS.admin, 1e15, 1e15)).not.toThrow()
  })
})

describe("Claude picks", () => {
  it("allow a run until the month's count is reached", () => {
    expect(claudeRunsError(PLANS.free, 9)).toBeNull()
    expect(claudeRunsError(PLANS.free, 10)?.message).toBe(
      "You've used your plan's 10 Claude picks for this month"
    )
    expect(claudeRunsError(PLANS.admin, 1e6)).toBeNull()
  })
})
