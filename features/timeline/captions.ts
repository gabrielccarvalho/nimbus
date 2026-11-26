import type {
  CaptionItem,
  CaptionLaneEdit,
  CaptionPage,
  PageOverride,
} from "../captions/pages"
import { fitInLane, placeAtPlayhead, type Span } from "./lanes"

export const MIN_CAPTION_MS = 200
export const NEW_CAPTION_MS = 1500

export type PageEdits = Record<number, Omit<PageOverride, "index">>

export type CaptionState = {
  pageEdits: PageEdits
  offsetMs: number
  added: readonly CaptionItem[]
  lanes: readonly CaptionLaneEdit[]
}

export type CaptionRef = { lane: number; index: number }

export type CaptionBlock = Span & { index: number; text: string }

const position = (index: number) => -1 - index
const textOf = (page: CaptionPage) => page.words.map((w) => w.text).join(" ")

const blocksOf = (items: readonly CaptionItem[]) =>
  items.map((item, i) => ({ ...item, index: position(i) }))

export function captionBlocks(
  spoken: readonly CaptionPage[],
  state: CaptionState
): CaptionBlock[][] {
  return [
    [
      ...spoken
        .filter((page) => page.index >= 0)
        .map((page) => ({
          index: page.index,
          startMs: page.startMs,
          endMs: page.endMs,
          text: textOf(page),
        })),
      ...blocksOf(state.added),
    ].sort((a, b) => a.startMs - b.startMs),
    ...state.lanes.map((lane) => blocksOf(lane.captions)),
  ]
}

function laned(blocksByLane: readonly (readonly CaptionBlock[])[]) {
  return blocksByLane.flatMap((blocks, lane) =>
    blocks.map((block) => ({ ...block, lane }))
  )
}

function withItems(
  state: CaptionState,
  lane: number,
  update: (items: CaptionItem[]) => CaptionItem[]
): CaptionState {
  if (lane === 0) return { ...state, added: update([...state.added]) }
  return {
    ...state,
    lanes: state.lanes.map((edit, i) =>
      i === lane - 1 ? { ...edit, captions: update([...edit.captions]) } : edit
    ),
  }
}

function itemsOf(state: CaptionState, lane: number) {
  return lane === 0 ? state.added : (state.lanes[lane - 1]?.captions ?? [])
}

function removeCaption(state: CaptionState, ref: CaptionRef): CaptionState {
  if (ref.lane === 0 && ref.index >= 0) {
    return {
      ...state,
      pageEdits: {
        ...state.pageEdits,
        [ref.index]: { ...state.pageEdits[ref.index], text: "" },
      },
    }
  }
  const at = position(ref.index)
  return withItems(state, ref.lane, (items) => items.filter((_, i) => i !== at))
}

function appendCaption(
  state: CaptionState,
  lane: number,
  item: CaptionItem
): { state: CaptionState; ref: CaptionRef } {
  const index = position(itemsOf(state, lane).length)
  return {
    state: withItems(state, lane, (items) => [...items, item]),
    ref: { lane, index },
  }
}

export function moveCaption(
  state: CaptionState,
  blocksByLane: readonly (readonly CaptionBlock[])[],
  ref: CaptionRef,
  target: { lane: number } & Span,
  durationMs: number
): { state: CaptionState; ref: CaptionRef } | undefined {
  const all = laned(blocksByLane)
  const at = all.findIndex((c) => c.lane === ref.lane && c.index === ref.index)
  const current = all[at]
  if (!current) return undefined
  const moving =
    target.lane !== ref.lane ||
    target.endMs - target.startMs === current.endMs - current.startMs
  const placed = fitInLane(
    all,
    at,
    target.lane,
    target,
    { startMs: 0, endMs: durationMs },
    { moving, minMs: MIN_CAPTION_MS }
  )
  if (!placed) return undefined

  if (target.lane === ref.lane) {
    if (ref.lane === 0 && ref.index >= 0) {
      return {
        ref,
        state: {
          ...state,
          pageEdits: {
            ...state.pageEdits,
            [ref.index]: {
              ...state.pageEdits[ref.index],
              startMs: Math.max(0, placed.startMs - state.offsetMs),
              endMs: Math.max(1, placed.endMs - state.offsetMs),
            },
          },
        },
      }
    }
    const i = position(ref.index)
    return {
      ref,
      state: withItems(state, ref.lane, (items) =>
        items.map((item, j) => (j === i ? { ...item, ...placed } : item))
      ),
    }
  }

  const removed = removeCaption(state, ref)
  return appendCaption(removed, target.lane, { ...placed, text: current.text })
}

export function addCaption(
  state: CaptionState,
  blocksByLane: readonly (readonly CaptionBlock[])[],
  atMs: number,
  durationMs: number,
  text = "New caption"
): { state: CaptionState; ref: CaptionRef } | undefined {
  const placed = placeAtPlayhead(
    laned(blocksByLane),
    { startMs: 0, endMs: durationMs },
    atMs,
    NEW_CAPTION_MS,
    { minMs: MIN_CAPTION_MS, maxLanes: blocksByLane.length }
  )
  if (!placed) return undefined
  const { lane, ...span } = placed
  return appendCaption(state, lane, { ...span, text })
}

export function addCaptionAt(
  state: CaptionState,
  lane: number,
  span: Span,
  text = "New caption"
): { state: CaptionState; ref: CaptionRef } {
  return appendCaption(state, lane, { ...span, text })
}

export function deleteCaption(
  state: CaptionState,
  ref: CaptionRef
): CaptionState {
  return removeCaption(state, ref)
}

export function setCaptionText(
  state: CaptionState,
  ref: CaptionRef,
  text: string
): CaptionState {
  if (ref.lane === 0 && ref.index >= 0) {
    return {
      ...state,
      pageEdits: {
        ...state.pageEdits,
        [ref.index]: { ...state.pageEdits[ref.index], text },
      },
    }
  }
  const at = position(ref.index)
  return withItems(state, ref.lane, (items) =>
    items.map((item, i) => (i === at ? { ...item, text } : item))
  )
}

export function findCaption(
  blocksByLane: readonly (readonly CaptionBlock[])[],
  ref: CaptionRef
) {
  return blocksByLane[ref.lane]?.find((block) => block.index === ref.index)
}
