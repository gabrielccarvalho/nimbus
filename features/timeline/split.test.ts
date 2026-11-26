import { describe, expect, it } from "vitest"

import type { MusicClip } from "../music/schema"
import type { CaptionState } from "./captions"
import { splitCaption, splitItem, splitMusic } from "./split"

describe("splitItem", () => {
  const items = [
    { startMs: 0, endMs: 1000, lane: 0 },
    { startMs: 2000, endMs: 4000, lane: 1 },
  ]

  it("cuts one item in two at the playhead and keeps its other fields", () => {
    expect(splitItem(items, 1, 2600.4, 200)).toEqual([
      items[0],
      { startMs: 2000, endMs: 2600, lane: 1 },
      { startMs: 2600, endMs: 4000, lane: 1 },
    ])
  })

  it("refuses when a half would be shorter than the minimum", () => {
    expect(splitItem(items, 1, 2100, 200)).toBeUndefined()
    expect(splitItem(items, 1, 3900, 200)).toBeUndefined()
    expect(splitItem(items, 1, 5000, 200)).toBeUndefined()
    expect(splitItem(items, 5, 2600, 200)).toBeUndefined()
  })
})

describe("splitMusic", () => {
  const clip: MusicClip = {
    trackId: "t1",
    startMs: 1000,
    endMs: 9000,
    inMs: 5000,
    db: -16,
    fadeInMs: 300,
    fadeOutMs: 1500,
    lane: 0,
  }

  it("continues the song across the cut without fading at the seam", () => {
    expect(splitMusic([clip], 0, 4000, 500)).toEqual([
      { ...clip, endMs: 4000, fadeOutMs: 0 },
      { ...clip, startMs: 4000, inMs: 8000, fadeInMs: 0 },
    ])
  })

  it("refuses a cut too close to an edge", () => {
    expect(splitMusic([clip], 0, 1200, 500)).toBeUndefined()
  })
})

describe("splitCaption", () => {
  const state: CaptionState = {
    pageEdits: {},
    offsetMs: 0,
    added: [{ startMs: 0, endMs: 2000, text: "written" }],
    lanes: [
      { baseline: 0.3, captions: [{ startMs: 500, endMs: 1500, text: "up" }] },
    ],
  }

  it("splits a written caption on the spoken track", () => {
    expect(
      splitCaption(state, { lane: 0, index: -1 }, 800, 200)?.added
    ).toEqual([
      { startMs: 0, endMs: 800, text: "written" },
      { startMs: 800, endMs: 2000, text: "written" },
    ])
  })

  it("splits a caption on an extra track", () => {
    const next = splitCaption(state, { lane: 1, index: -1 }, 1000, 200)
    expect(next?.lanes[0]?.captions).toEqual([
      { startMs: 500, endMs: 1000, text: "up" },
      { startMs: 1000, endMs: 1500, text: "up" },
    ])
    expect(next?.added).toBe(state.added)
  })

  it("leaves spoken captions alone", () => {
    expect(splitCaption(state, { lane: 0, index: 3 }, 800, 200)).toBeUndefined()
  })
})
