import type { CaptionItem } from "../captions/pages"
import type { MusicClip } from "../music/schema"
import type { CaptionRef, CaptionState } from "./captions"
import type { Span } from "./lanes"

function halves<T extends Span>(
  item: T,
  atMs: number,
  minMs: number
): [T, T] | undefined {
  const at = Math.round(atMs)
  if (at - item.startMs < minMs || item.endMs - at < minMs) return undefined
  return [
    { ...item, endMs: at },
    { ...item, startMs: at },
  ]
}

export function splitItem<T extends Span>(
  items: readonly T[],
  index: number,
  atMs: number,
  minMs: number
): T[] | undefined {
  const item = items[index]
  const parts = item && halves(item, atMs, minMs)
  if (!parts) return undefined
  return [...items.slice(0, index), ...parts, ...items.slice(index + 1)]
}

export function splitMusic(
  clips: readonly MusicClip[],
  index: number,
  atMs: number,
  minMs: number
): MusicClip[] | undefined {
  const clip = clips[index]
  const parts = clip && halves(clip, atMs, minMs)
  if (!parts) return undefined
  const [left, right] = parts
  return [
    ...clips.slice(0, index),
    { ...left, fadeOutMs: 0 },
    {
      ...right,
      inMs: clip.inMs + right.startMs - clip.startMs,
      fadeInMs: 0,
    },
    ...clips.slice(index + 1),
  ]
}

export function splitCaption(
  state: CaptionState,
  ref: CaptionRef,
  atMs: number,
  minMs: number
): CaptionState | undefined {
  if (ref.index >= 0) return undefined
  const at = -1 - ref.index
  const items: readonly CaptionItem[] =
    ref.lane === 0 ? state.added : (state.lanes[ref.lane - 1]?.captions ?? [])
  const next = splitItem(items, at, atMs, minMs)
  if (!next) return undefined
  if (ref.lane === 0) return { ...state, added: next }
  return {
    ...state,
    lanes: state.lanes.map((lane, i) =>
      i === ref.lane - 1 ? { ...lane, captions: next } : lane
    ),
  }
}
