import { describe, expect, it } from "vitest"

import {
  downsampleMax,
  estimateRemainingMs,
  stepDetailSchema,
  textTail,
} from "./detail"

describe("step details", () => {
  it("keeps the end of the transcript on a word boundary", () => {
    expect(textTail("short")).toBe("short")
    expect(textTail("one two three four", 9)).toBe("four")
  })

  it("downsamples by keeping each bucket's peak", () => {
    expect(downsampleMax([1, 5, 2, 2, 9, 3], 3)).toEqual([5, 2, 9])
    expect(downsampleMax([1, 2], 5)).toEqual([1, 2])
  })

  it("estimates the time left only once there's enough to go on", () => {
    expect(estimateRemainingMs(10_000, 25)).toBe(30_000)
    expect(estimateRemainingMs(10_000, 1)).toBeNull()
    expect(estimateRemainingMs(500, 50)).toBeNull()
    expect(estimateRemainingMs(10_000, 100)).toBeNull()
  })

  it("rejects details from another shape", () => {
    expect(stepDetailSchema.safeParse({ kind: "download" }).success).toBe(false)
  })
})
