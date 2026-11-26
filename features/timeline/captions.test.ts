import { describe, expect, it } from "vitest"

import { editCaptionPages, type CaptionPage } from "../captions/pages"
import {
  addCaption,
  captionBlocks,
  deleteCaption,
  findCaption,
  moveCaption,
  setCaptionText,
  type CaptionState,
} from "./captions"

const page = (index: number, startMs: number, endMs: number, text: string) =>
  ({
    index,
    startMs,
    endMs,
    words: [{ text, startMs, endMs }],
    lines: [1],
  }) satisfies CaptionPage

const transcript = [page(0, 1000, 2000, "hello"), page(1, 3000, 4000, "world")]
const empty: CaptionState = {
  pageEdits: {},
  offsetMs: 0,
  added: [],
  lanes: [{ baseline: 0.3, captions: [] }],
}
const lanesOf = (state: CaptionState) =>
  captionBlocks(
    editCaptionPages(
      transcript,
      {
        offsetMs: state.offsetMs,
        pages: Object.entries(state.pageEdits).map(([index, edit]) => ({
          index: Number(index),
          ...edit,
        })),
      },
      10_000
    ),
    state
  )
const pagesOf = lanesOf

describe("caption edits", () => {
  it("re-times a transcript caption before the offset, up to its neighbour", () => {
    const state = { ...empty, offsetMs: 500 }
    const moved = moveCaption(
      state,
      pagesOf(state),
      { lane: 0, index: 0 },
      { lane: 0, startMs: 2000, endMs: 3000 },
      10_000
    )
    expect(moved?.state.pageEdits).toEqual({
      0: { startMs: 1500, endMs: 2500 },
    })
    expect(moved?.ref).toEqual({ lane: 0, index: 0 })
  })

  it("moves a transcript caption to another lane as a written caption", () => {
    const moved = moveCaption(
      empty,
      lanesOf(empty),
      { lane: 0, index: 1 },
      { lane: 1, startMs: 3500, endMs: 4500 },
      10_000
    )!
    expect(moved.state.pageEdits).toEqual({ 1: { text: "" } })
    expect(moved.state.lanes[0]!.captions).toEqual([
      { startMs: 3500, endMs: 4500, text: "world" },
    ])
    expect(moved.ref).toEqual({ lane: 1, index: -1 })
    expect(pagesOf(moved.state)[0]!.map((p) => p.index)).toEqual([0])
    expect(pagesOf(moved.state)[1]).toEqual([
      { index: -1, startMs: 3500, endMs: 4500, text: "world" },
    ])
  })

  it("moves a written caption back to the transcript lane into free room", () => {
    const state = {
      ...empty,
      lanes: [
        {
          baseline: 0.3,
          captions: [{ startMs: 1500, endMs: 2500, text: "hey" }],
        },
      ],
    }
    const moved = moveCaption(
      state,
      lanesOf(state),
      { lane: 1, index: -1 },
      { lane: 0, startMs: 1500, endMs: 2500 },
      10_000
    )!
    expect(moved.state.lanes[0]!.captions).toEqual([])
    expect(moved.state.added).toEqual([
      { startMs: 2000, endMs: 3000, text: "hey" },
    ])
    expect(moved.ref).toEqual({ lane: 0, index: -1 })
  })

  it("adds a caption at the playhead on the first lane with room", () => {
    const first = addCaption(empty, lanesOf(empty), 5000, 10_000)!
    expect(first.ref).toEqual({ lane: 0, index: -1 })
    expect(first.state.added).toEqual([
      { startMs: 5000, endMs: 6500, text: "New caption" },
    ])
    const second = addCaption(empty, lanesOf(empty), 1500, 10_000)!
    expect(second.ref).toEqual({ lane: 1, index: -1 })
    expect(second.state.lanes[0]!.captions[0]).toMatchObject({
      startMs: 1500,
      endMs: 3000,
    })
    const crowded = { ...empty, lanes: [] }
    expect(addCaption(crowded, lanesOf(crowded), 1500, 10_000)?.ref).toEqual(
      undefined
    )
  })

  it("edits and deletes both kinds of captions", () => {
    const withWritten = addCaption(empty, lanesOf(empty), 5000, 10_000)!.state
    const pages = lanesOf(withWritten)
    const written = { lane: 0, index: -1 }
    const spoken = { lane: 0, index: 0 }
    expect(findCaption(pages, written)?.text).toBe("New caption")
    expect(findCaption(pages, spoken)?.text).toBe("hello")
    const edited = setCaptionText(
      setCaptionText(withWritten, written, "Go"),
      spoken,
      "HELLO"
    )
    expect(edited.added[0]!.text).toBe("Go")
    expect(edited.pageEdits[0]).toEqual({ text: "HELLO" })
    const deleted = deleteCaption(deleteCaption(edited, written), spoken)
    expect(deleted.added).toEqual([])
    expect(deleted.pageEdits[0]).toEqual({ text: "" })
    const blank = setCaptionText(withWritten, written, "")
    expect(findCaption(lanesOf(blank), written)).toMatchObject({ text: "" })
  })
})
