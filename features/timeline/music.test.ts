import { describe, expect, it } from "vitest"

import { newMusicClip } from "../music/schema"
import { moveItem } from "./lanes"
import { retimeMusic } from "./music"

const song = (startMs: number, endMs: number, lane = 0, inMs = 0) => ({
  ...newMusicClip("t1", { startMs, endMs, lane }),
  inMs,
})

describe("moving laned items", () => {
  it("moves into another lane where there's room and refuses a full one", () => {
    const items = [
      { startMs: 0, endMs: 2000, lane: 0 },
      { startMs: 1000, endMs: 3000, lane: 1 },
    ]
    const bounds = { startMs: 0, endMs: 10_000 }
    expect(
      moveItem(items, 0, { startMs: 4000, endMs: 6000, lane: 1 }, bounds, 100)
    ).toEqual([
      { startMs: 4000, endMs: 6000, lane: 1 },
      { startMs: 1000, endMs: 3000, lane: 1 },
    ])
    expect(
      moveItem(items, 0, { startMs: 1500, endMs: 3500, lane: 1 }, bounds, 100)
    ).toBeUndefined()
  })
})

describe("re-timing music", () => {
  it("moves a song without changing where it plays from", () => {
    const moved = retimeMusic(
      [song(0, 5000, 0, 2000)],
      0,
      { startMs: 3000, endMs: 8000, lane: 1 },
      20_000,
      60_000
    )
    expect(moved?.[0]).toMatchObject({
      startMs: 3000,
      endMs: 8000,
      lane: 1,
      inMs: 2000,
    })
  })

  it("trims the start by moving the in-point, and can't reach before the song", () => {
    const clips = [song(4000, 9000, 0, 1000)]
    expect(
      retimeMusic(
        clips,
        0,
        { startMs: 5000, endMs: 9000, lane: 0 },
        20_000,
        60_000
      )?.[0]
    ).toMatchObject({ startMs: 5000, inMs: 2000 })
    expect(
      retimeMusic(
        clips,
        0,
        { startMs: 1000, endMs: 9000, lane: 0 },
        20_000,
        60_000
      )?.[0]
    ).toMatchObject({ startMs: 3000, inMs: 0 })
  })

  it("can't stretch past the end of the song", () => {
    expect(
      retimeMusic(
        [song(0, 5000, 0, 8000)],
        0,
        { startMs: 0, endMs: 15_000, lane: 0 },
        20_000,
        10_000
      )?.[0]
    ).toMatchObject({ endMs: 2000 })
  })
})
