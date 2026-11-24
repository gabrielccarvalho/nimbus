import { describe, expect, it } from "vitest"

import { nextQuotaReset, pacificDay } from "./quota"

describe("pacificDay", () => {
  it("rolls over at midnight Pacific", () => {
    expect(pacificDay(new Date("2026-11-25T07:59:00Z"))).toBe("2026-11-24")
    expect(pacificDay(new Date("2026-11-25T08:00:00Z"))).toBe("2026-11-25")
  })
})

describe("nextQuotaReset", () => {
  it("is DST-correct across the spring change", () => {
    expect(nextQuotaReset(new Date("2026-03-08T12:00:00Z"))).toEqual(
      new Date("2026-03-09T07:00:00Z")
    )
  })

  it("uses standard time in winter", () => {
    expect(nextQuotaReset(new Date("2026-11-24T12:00:00Z"))).toEqual(
      new Date("2026-11-25T08:00:00Z")
    )
  })

  it("is strictly after the input at the boundary", () => {
    expect(nextQuotaReset(new Date("2026-11-25T08:00:00Z"))).toEqual(
      new Date("2026-11-26T08:00:00Z")
    )
  })
})
