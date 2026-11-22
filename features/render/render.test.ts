import { describe, expect, it } from "vitest"

import { planLayout } from "../layout/geometry"
import { FULL_FRAME } from "../layout/schema"
import { hasRoomFor } from "@/lib/storage/disk"

import { estimateRenderBytes } from "./disk"
import { editedDuration, keepRanges, remapToEdit } from "./edit"
import {
  chooseEncoder,
  encoderPreference,
  videoEncoderArgs,
  editGraph,
  escapeFilterPath,
  outputFps,
  renderArgs,
  seekFor,
  verticalGraph,
} from "./filtergraph"

const subtitles = { file: "/data/work/c1.ass", fontsDir: "/app/assets/fonts" }
const webcamRect = { x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 }

describe("verticalGraph", () => {
  it("builds cam-top with captions", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "cam-top",
        },
        1920,
        1080
      ),
      startMs: 12_000,
      endMs: 41_500,
      fps: 30,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/cam-top.txt")
  })

  it("builds split-50 near the start without pre-roll", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.2,
          mode: "split-50",
        },
        2560,
        1080
      ),
      startMs: 500,
      endMs: 16_000,
      fps: 60,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/split-50.txt")
  })

  it("builds no-cam-blur-fill", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect: null,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "no-cam-blur-fill",
        },
        1920,
        1080
      ),
      startMs: 30_000,
      endMs: 45_000,
      fps: 29.97,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/blur-fill.txt")
  })
})

describe("editGraph", () => {
  it("concatenates keep ranges", async () => {
    const graph = editGraph({
      keep: [
        { startMs: 0, endMs: 4150 },
        { startMs: 5850, endMs: 20_000 },
      ],
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/edit.txt")
  })
})

describe("helpers", () => {
  it("escapes paths for both filtergraph levels", () => {
    expect(escapeFilterPath("/tmp/a b/c.ass")).toBe("/tmp/a b/c.ass")
    expect(escapeFilterPath("C:\\x")).toBe("C\\\\:\\\\\\\\x")
    expect(escapeFilterPath("/it's,[x];y")).toBe("/it\\\\\\'s\\,\\[x\\]\\;y")
  })

  it("picks the output frame rate", () => {
    expect(outputFps(60)).toBe(60)
    expect(outputFps(144)).toBe(30)
    expect(outputFps(23.976)).toBe(23.976)
    expect(outputFps(null)).toBe(30)
  })

  it("seeks two seconds before the clip", () => {
    expect(seekFor(12_000)).toEqual({ seekMs: 10_000, offsetMs: 2000 })
    expect(seekFor(500)).toEqual({ seekMs: 0, offsetMs: 500 })
  })

  it("chooses an encoder", () => {
    const available = new Set(["libx264", "h264_videotoolbox"])
    expect(chooseEncoder("libx264", available)).toBe("libx264")
    expect(chooseEncoder("auto", available)).toBe("h264_videotoolbox")
    expect(chooseEncoder("auto", new Set(["libx264"]))).toBe("libx264")
    expect(encoderPreference(false, "h264_nvenc")).toBe("libx264")
    expect(encoderPreference(true, "libx264")).toBe("auto")
    expect(encoderPreference(true, "h264_nvenc")).toBe("h264_nvenc")
    expect(videoEncoderArgs("libx264", 26)).toContain("26")
    expect(videoEncoderArgs("h264_videotoolbox", 17)).toContain("70")
    expect(videoEncoderArgs("h264_videotoolbox", 26)).toContain("55")
  })

  it("builds the ffmpeg arguments", () => {
    expect(
      renderArgs({
        input: "/in.mp4",
        seekMs: 10_000,
        graphFile: "/g.txt",
        encoder: "libx264",
        output: "/out.mp4",
      })
    ).toEqual([
      "-ss",
      "10.000",
      "-i",
      "/in.mp4",
      "-/filter_complex",
      "/g.txt",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      "/out.mp4",
    ])
  })

  it("checks disk headroom", () => {
    const estimate = estimateRenderBytes(60_000)
    expect(estimate).toBe(61_200_000)
    expect(hasRoomFor(2 * estimate + 500 * 1024 ** 2, estimate)).toBe(true)
    expect(hasRoomFor(2 * estimate, estimate)).toBe(false)
  })
})

describe("keepRanges", () => {
  it("cuts long silences with padding and keeps short ones", () => {
    const keep = keepRanges(
      [
        { startMs: 4000, endMs: 6000 },
        { startMs: 9000, endMs: 9800 },
        { startMs: 19_000, endMs: 20_000 },
      ],
      20_000
    )
    expect(keep).toEqual([
      { startMs: 0, endMs: 4150 },
      { startMs: 5850, endMs: 20_000 },
    ])
    expect(editedDuration(keep)).toBe(18_300)
  })

  it("merges overlapping cuts and handles edges", () => {
    expect(
      keepRanges(
        [
          { startMs: 0, endMs: 3000 },
          { startMs: 2500, endMs: 5000 },
          { startMs: 8000, endMs: 10_000 },
        ],
        10_000
      )
    ).toEqual([
      { startMs: 0, endMs: 150 },
      { startMs: 4850, endMs: 8150 },
      { startMs: 9850, endMs: 10_000 },
    ])
    expect(keepRanges([], 5000)).toEqual([{ startMs: 0, endMs: 5000 }])
  })

  it("moves words onto the cut timeline and drops cut ones", () => {
    const keep = [
      { startMs: 0, endMs: 4150 },
      { startMs: 5850, endMs: 20_000 },
    ]
    expect(
      remapToEdit(
        [
          { text: "a", startMs: 3000, endMs: 3500 },
          { text: "b", startMs: 4000, endMs: 4400 },
          { text: "gone", startMs: 5000, endMs: 5400 },
          { text: "c", startMs: 6000, endMs: 6500 },
        ],
        keep
      )
    ).toEqual([
      { text: "a", startMs: 3000, endMs: 3500 },
      { text: "b", startMs: 4000, endMs: 4150 },
      { text: "c", startMs: 4300, endMs: 4800 },
    ])
  })
})
