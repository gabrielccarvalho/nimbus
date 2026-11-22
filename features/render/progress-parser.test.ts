import { describe, expect, it } from "vitest"

import { createProgressParser } from "./progress-parser"

const block = (outTimeUs: string, progress = "continue", speed = "2.5x") => [
  "frame=120",
  "fps=60.0",
  `out_time_us=${outTimeUs}`,
  "out_time=00:00:04.000000",
  "dup_frames=0",
  `speed=${speed}`,
  `progress=${progress}`,
]

function feed(
  parser: ReturnType<typeof createProgressParser>,
  lines: string[]
) {
  return lines.map(parser).filter((p) => p !== null)
}

describe("ffmpeg progress parser", () => {
  it("emits one update per block", () => {
    const parser = createProgressParser(10_000)
    expect(feed(parser, block("4000000"))).toEqual([
      { outTimeMs: 4000, percent: 40, speed: 2.5, done: false },
    ])
  })

  it("caps at 99.9 until the end block", () => {
    const parser = createProgressParser(10_000)
    expect(feed(parser, block("12000000"))[0]?.percent).toBe(99.9)
    expect(feed(parser, block("12000000", "end"))[0]).toMatchObject({
      percent: 100,
      done: true,
    })
  })

  it("accepts out_time_ms (also microseconds) and N/A values", () => {
    const parser = createProgressParser(2_000)
    feed(parser, ["out_time_ms=1000000"])
    feed(parser, ["out_time_us=N/A", "speed=N/A"])
    expect(feed(parser, ["progress=continue"])[0]).toEqual({
      outTimeMs: 1000,
      percent: 50,
      speed: null,
      done: false,
    })
  })

  it("ignores noise and handles unknown duration", () => {
    const parser = createProgressParser(0)
    expect(feed(parser, ["", "garbage", "bitrate=1kbits/s"])).toEqual([])
    expect(feed(parser, block("1000000"))[0]?.percent).toBe(0)
  })
})
