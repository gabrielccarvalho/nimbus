import { describe, expect, it } from "vitest"

import {
  clipParts,
  mergeParts,
  movePart,
  overlapsParts,
  partIndexAt,
  partsProblem,
  partsRange,
  remapItems,
  resizeParts,
  sourceRanges,
  splitPartAt,
  storedParts,
  timelineItems,
  timelinePoints,
  toSourceMs,
  toTimelineMs,
} from "./parts"

const parts = [
  { startMs: 60_000, endMs: 70_000 },
  { startMs: 10_000, endMs: 15_000 },
  { startMs: 300_000, endMs: 308_000 },
]

describe("a clip's timeline", () => {
  it("is the recording's for a clip with one part", () => {
    const clip = { startMs: 4000, endMs: 9000, parts: null }
    expect(clipParts(clip)).toEqual([{ startMs: 4000, endMs: 9000 }])
    expect(toSourceMs(clipParts(clip), 6500)).toBe(6500)
    expect(storedParts(clipParts(clip))).toEqual(clip)
  })

  it("starts at the first part and runs through the parts back to back", () => {
    expect(partsRange(parts)).toEqual({ startMs: 60_000, endMs: 83_000 })
    expect(storedParts(parts)).toEqual({
      startMs: 60_000,
      endMs: 83_000,
      parts,
    })
    expect(partIndexAt(parts, 69_999)).toBe(0)
    expect(partIndexAt(parts, 70_000)).toBe(1)
    expect(toSourceMs(parts, 61_000)).toBe(61_000)
    expect(toSourceMs(parts, 72_000)).toBe(12_000)
    expect(toSourceMs(parts, 75_000)).toBe(300_000)
    expect(toTimelineMs(parts, 12_000)).toBe(72_000)
    expect(toTimelineMs(parts, 20_000)).toBeNull()
  })

  it("keeps following the recording past either end", () => {
    expect(toSourceMs(parts, 58_000)).toBe(58_000)
    expect(toSourceMs(parts, 85_000)).toBe(310_000)
  })

  it("cuts a stretch of the timeline into the recording ranges under it", () => {
    expect(sourceRanges(parts, { startMs: 68_000, endMs: 76_000 })).toEqual([
      { startMs: 68_000, endMs: 70_000 },
      { startMs: 10_000, endMs: 15_000 },
      { startMs: 300_000, endMs: 301_000 },
    ])
    expect(sourceRanges(parts, { startMs: 59_000, endMs: 60_500 })).toEqual([
      { startMs: 59_000, endMs: 60_500 },
    ])
  })
})

describe("moving things onto the timeline", () => {
  const words = [
    { text: "early", startMs: 11_000, endMs: 11_400 },
    { text: "gap", startMs: 20_000, endMs: 20_400 },
    { text: "first", startMs: 69_800, endMs: 70_600 },
    { text: "late", startMs: 301_000, endMs: 301_500 },
  ]

  it("places words by the part they are in and drops the rest", () => {
    expect(timelineItems(words, parts)).toEqual([
      { text: "first", startMs: 69_800, endMs: 70_000 },
      { text: "early", startMs: 71_000, endMs: 71_400 },
      { text: "late", startMs: 76_000, endMs: 76_500 },
    ])
  })

  it("leaves a one-part clip's words alone", () => {
    expect(timelineItems(words, [parts[0]!])).toEqual(words)
  })

  it("places beats and drops the ones between parts", () => {
    expect(
      timelinePoints(
        [
          { ms: 12_000, kind: "weird" },
          { ms: 40_000, kind: "weird" },
        ],
        parts
      )
    ).toEqual([{ ms: 72_000, kind: "weird" }])
  })
})

describe("editing parts", () => {
  it("moves the first part's start and the last part's end with the clip's ends", () => {
    expect(resizeParts(parts, { startMs: 58_000, endMs: 85_000 })).toEqual([
      { startMs: 58_000, endMs: 70_000 },
      parts[1],
      { startMs: 300_000, endMs: 310_000 },
    ])
  })

  it("keeps a second of each end part", () => {
    const resized = resizeParts(parts, { startMs: 69_900, endMs: 75_200 })
    expect(resized[0]).toEqual({ startMs: 69_000, endMs: 70_000 })
    expect(resized[2]).toEqual({ startMs: 300_000, endMs: 301_000 })
  })

  it("splits the part under the playhead, at least a second from its ends", () => {
    expect(splitPartAt(parts, 72_000)).toEqual([
      parts[0],
      { startMs: 10_000, endMs: 12_000 },
      { startMs: 12_000, endMs: 15_000 },
      parts[2],
    ])
    expect(splitPartAt(parts, 70_500)).toBeUndefined()
  })

  it("reorders parts", () => {
    expect(movePart(parts, 2, 0)).toEqual([parts[2], parts[0], parts[1]])
    expect(movePart(parts, 0, 5)).toEqual(parts)
  })

  it("joins neighbours that continue each other", () => {
    expect(
      mergeParts([
        { startMs: 0, endMs: 5000 },
        { startMs: 5000, endMs: 9000 },
        { startMs: 20_000, endMs: 22_000 },
      ])
    ).toEqual([
      { startMs: 0, endMs: 9000 },
      { startMs: 20_000, endMs: 22_000 },
    ])
  })

  it("keeps effects on the same moment when a part before them changes", () => {
    const shorter = [{ startMs: 62_000, endMs: 70_000 }, parts[1]!, parts[2]!]
    expect(
      remapItems(
        [
          { kind: "zoom", startMs: 71_000, endMs: 72_000 },
          { kind: "zoom", startMs: 60_500, endMs: 61_000 },
        ],
        parts,
        shorter
      )
    ).toEqual([{ kind: "zoom", startMs: 71_000, endMs: 72_000 }])
    expect(
      remapItems([{ kind: "zoom", startMs: 76_000, endMs: 77_000 }], parts, [
        parts[0]!,
        parts[2]!,
      ])
    ).toEqual([{ kind: "zoom", startMs: 71_000, endMs: 72_000 }])
  })
})

describe("checking parts", () => {
  it("accepts parts in any order that don't overlap", () => {
    expect(partsProblem(parts, 400_000)).toBeNull()
  })

  it("names what is wrong", () => {
    expect(partsProblem(parts, 200_000)).toBe(
      "The clip must stay inside the recording"
    )
    expect(
      partsProblem(
        [
          { startMs: 0, endMs: 5000 },
          { startMs: 4000, endMs: 9000 },
        ],
        60_000
      )
    ).toBe("Two parts of the clip overlap")
    expect(partsProblem([{ startMs: 0, endMs: 400 }], 60_000)).toBe(
      "Each part must be at least 1 second long"
    )
    expect(partsProblem([], 60_000)).toBe("The clip needs at least one part")
  })

  it("compares clips by their parts, not by where they start and end", () => {
    const joined = { startMs: 60_000, endMs: 83_000, parts }
    expect(overlapsParts(joined, { startMs: 12_000, endMs: 14_000 })).toBe(true)
    expect(overlapsParts(joined, { startMs: 71_000, endMs: 74_000 })).toBe(
      false
    )
  })
})
