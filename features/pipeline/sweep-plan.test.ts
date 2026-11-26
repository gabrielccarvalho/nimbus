import { describe, expect, it } from "vitest"

import { planSweep, SWEEP_MIN_AGE_MS } from "./sweep-plan"

const NOW = 10 * 24 * 60 * 60_000
const old = NOW - SWEEP_MIN_AGE_MS.upload - 1
const hourOld = NOW - SWEEP_MIN_AGE_MS.orphan - 1
const fresh = NOW - 1000

const plan = (files: { key: string; mtimeMs: number }[]) =>
  planSweep({
    files,
    projectIds: new Set(["live", "busy"]),
    trackIds: new Set(["track"]),
    busyProjectIds: new Set(["busy"]),
    referencedKeys: new Set(["projects/live/renders/kept.mp4"]),
    nowMs: NOW,
  })

describe("planSweep", () => {
  it("removes stale leftovers only", () => {
    expect(
      plan([
        { key: "tmp/uploads/a.part", mtimeMs: old },
        { key: "tmp/uploads/b.part", mtimeMs: fresh },
        { key: "tmp/downloads/p1/source.mp4.part", mtimeMs: old },
        { key: "tmp/downloads/p2/source.mp4.part", mtimeMs: fresh },
        { key: "projects/gone/source.mp4", mtimeMs: old },
        { key: "projects/gone/new.mp4", mtimeMs: fresh },
        { key: "projects/live/work/x-graph.txt", mtimeMs: old },
        { key: "projects/live/work/y-graph.txt", mtimeMs: fresh },
        { key: "projects/live/renders/kept.mp4", mtimeMs: old },
        { key: "projects/live/renders/stray.mp4", mtimeMs: old },
        { key: "projects/live/source.mp4", mtimeMs: old },
        { key: "projects/busy/work/z.mp4", mtimeMs: old },
        { key: "projects/busy/renders/stray.mp4", mtimeMs: old },
        { key: "app.db", mtimeMs: old },
      ])
    ).toEqual([
      "tmp/uploads/a.part",
      "tmp/downloads/p1/source.mp4.part",
      "projects/gone/source.mp4",
      "projects/live/work/x-graph.txt",
      "projects/live/renders/stray.mp4",
    ])
  })

  it("gives an upload at its final key until the completion deadline", () => {
    expect(
      plan([
        { key: "projects/gone/source.mp4", mtimeMs: hourOld },
        { key: "projects/gone/source.mp4.1.2.part", mtimeMs: hourOld },
        { key: "projects/gone/audio.wav", mtimeMs: hourOld },
        { key: "music/ws/orphan.mp3", mtimeMs: old },
        { key: "music/ws/pending.mp3", mtimeMs: hourOld },
        { key: "music/ws/track.mp3", mtimeMs: old },
      ])
    ).toEqual(["projects/gone/audio.wav", "music/ws/orphan.mp3"])
  })
})
