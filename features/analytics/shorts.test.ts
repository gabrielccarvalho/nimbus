import { describe, expect, it } from "vitest"

import {
  contentTypeOf,
  importableShort,
  isShort,
  parseIsoDuration,
} from "./shorts"

describe("shorts", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT59S")).toBe(59_000)
    expect(parseIsoDuration("PT1M5S")).toBe(65_000)
    expect(parseIsoDuration("PT3M")).toBe(180_000)
    expect(parseIsoDuration("PT1H")).toBe(3_600_000)
    expect(parseIsoDuration("P1DT0S")).toBe(86_400_000)
    expect(parseIsoDuration("P0D")).toBe(0)
    expect(parseIsoDuration("soon")).toBeNull()
  })

  it("uses duration unless the probe answered", () => {
    expect(isShort({ durationMs: 180_000, contentType: null })).toBe(true)
    expect(isShort({ durationMs: 180_001, contentType: null })).toBe(false)
    expect(isShort({ durationMs: 0, contentType: null })).toBe(false)
    expect(isShort({ durationMs: null, contentType: null })).toBe(false)
    expect(
      isShort({ durationMs: 150_000, contentType: "VIDEO_ON_DEMAND" })
    ).toBe(false)
    expect(isShort({ durationMs: 170_000, contentType: "SHORTS" })).toBe(true)
  })

  it("imports only processed public or unlisted Shorts", () => {
    const v = {
      videoId: "v",
      title: "t",
      publishedAt: new Date(),
      durationMs: 30_000,
      privacy: "public" as const,
      uploadStatus: "processed",
    }
    expect(importableShort(v, null)).toBe(true)
    expect(importableShort({ ...v, privacy: "unlisted" }, null)).toBe(true)
    expect(importableShort({ ...v, privacy: "private" }, null)).toBe(false)
    expect(importableShort({ ...v, uploadStatus: "uploaded" }, null)).toBe(
      false
    )
  })

  it("maps creatorContentType", () => {
    expect(contentTypeOf("SHORTS")).toBe("shorts")
    expect(contentTypeOf("VIDEO_ON_DEMAND")).toBe("long")
    expect(contentTypeOf("LIVE_STREAM")).toBe("other")
    expect(contentTypeOf("UNSPECIFIED")).toBe("other")
  })
})
