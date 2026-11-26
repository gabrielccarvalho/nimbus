import { MIN_MUSIC_MS, type MusicClip } from "../music/schema"
import { moveItem, type Laned } from "./lanes"

export function retimeMusic(
  clips: readonly MusicClip[],
  index: number,
  target: Laned,
  clipDurationMs: number,
  trackDurationMs: number
): MusicClip[] | undefined {
  const current = clips[index]
  if (!current) return undefined
  const resizingStart =
    target.lane === current.lane &&
    target.endMs === current.endMs &&
    target.startMs !== current.startMs
  const inMs = resizingStart
    ? Math.max(0, current.inMs + target.startMs - current.startMs)
    : current.inMs
  const room = trackDurationMs - inMs
  const startMs = resizingStart
    ? Math.max(target.startMs, current.startMs - current.inMs)
    : target.startMs
  const endMs = Math.min(target.endMs, startMs + room)
  if (endMs - startMs < MIN_MUSIC_MS) return undefined
  const moved = moveItem(
    clips,
    index,
    { lane: target.lane, startMs, endMs },
    { startMs: 0, endMs: clipDurationMs },
    MIN_MUSIC_MS
  )
  if (!moved) return undefined
  const placed = moved[index]!
  return moved.map((clip, i) =>
    i === index
      ? {
          ...clip,
          inMs: resizingStart
            ? Math.max(0, current.inMs + placed.startMs - current.startMs)
            : current.inMs,
        }
      : clip
  )
}
