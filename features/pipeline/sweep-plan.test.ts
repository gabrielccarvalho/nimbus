import { describe, expect, it } from "vitest"

import { planSweep, SWEEP_MIN_AGE_MS } from "./sweep-plan"

const NOW = 10 * 24 * 60 * 60_000
const old = NOW - SWEEP_MIN_AGE_MS.upload - 1
const fresh = NOW - 1000

const plan = (files: { key: string; mtimeMs: number }[]) =>
  planSweep({
    files,
    projectIds: new Set(["live", "busy"]),
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
      "projects/gone/source.mp4",
      "projects/live/work/x-graph.txt",
      "projects/live/renders/stray.mp4",
    ])
  })
})
