import { describe, expect, it } from "vitest"

import { mimeForKey, parseRange } from "./range"

describe("parseRange", () => {
  it.each([
    [null, 100, { kind: "full" }],
    ["items=0-1", 100, { kind: "full" }],
    ["bytes=0-9", 100, { kind: "partial", start: 0, end: 9 }],
    ["bytes=90-", 100, { kind: "partial", start: 90, end: 99 }],
    ["bytes=90-500", 100, { kind: "partial", start: 90, end: 99 }],
    ["bytes=-10", 100, { kind: "partial", start: 90, end: 99 }],
    ["bytes=-500", 100, { kind: "partial", start: 0, end: 99 }],
    ["bytes=0-1,5-6", 100, { kind: "partial", start: 0, end: 1 }],
    ["bytes=100-", 100, { kind: "unsatisfiable" }],
    ["bytes=50-10", 100, { kind: "unsatisfiable" }],
    ["bytes=-0", 100, { kind: "unsatisfiable" }],
    ["bytes=-", 100, { kind: "unsatisfiable" }],
    ["bytes=0-", 0, { kind: "unsatisfiable" }],
  ] as const)("%s of %i bytes", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected)
  })
})

describe("mimeForKey", () => {
  it("maps known extensions", () => {
    expect(mimeForKey("a/b.mp4")).toBe("video/mp4")
    expect(mimeForKey("a/b.JPG")).toBe("image/jpeg")
    expect(mimeForKey("a/b")).toBe("application/octet-stream")
  })
})
