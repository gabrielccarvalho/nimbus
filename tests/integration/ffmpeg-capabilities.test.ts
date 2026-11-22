import { describe, expect, it } from "vitest"

import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { runOrThrow } from "@/lib/process/run"

import { fixtures } from "../../scripts/make-fixtures"

describe("ffmpeg capabilities", () => {
  it("detects ffmpeg and the analysis filters", async () => {
    const caps = await getFfmpegCapabilities(
      process.env.FFMPEG_PATH ?? "ffmpeg"
    )
    expect(caps.available).toBe(true)
    expect(caps.hasLibx264).toBe(true)
    expect(caps.filters.has("silencedetect")).toBe(true)
  })

  it("generated a 20 s 16:9 fixture", async () => {
    const { stdout } = await runOrThrow("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      fixtures.wide,
    ])
    const info = JSON.parse(stdout) as {
      streams: { width: number; height: number }[]
      format: { duration: string }
    }
    expect(info.streams[0]).toEqual({ width: 1920, height: 1080 })
    expect(Number(info.format.duration)).toBeCloseTo(20, 0)
  })
})
