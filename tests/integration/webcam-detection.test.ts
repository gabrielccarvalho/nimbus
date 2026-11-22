import { execFileSync } from "node:child_process"

import { describe, expect, it } from "vitest"

import {
  detectOverlayRect,
  type GrayFrame,
} from "@/features/layout/border-heuristic"
import { combineDetection } from "@/features/layout/detection"
import { getEnv } from "@/lib/env"

import { fixtures } from "../../scripts/make-fixtures"

const WIDTH = 320

function sampleFrames(
  file: string,
  sourceWidth: number,
  sourceHeight: number
): GrayFrame[] {
  const height = Math.round((WIDTH * sourceHeight) / sourceWidth / 2) * 2
  const raw = execFileSync(getEnv().FFMPEG_PATH, [
    "-v",
    "error",
    "-i",
    file,
    "-vf",
    `fps=0.4,scale=${WIDTH}:${height},format=gray`,
    "-frames:v",
    "8",
    "-f",
    "rawvideo",
    "-",
  ])
  const size = WIDTH * height
  return Array.from({ length: raw.length / size }, (_, i) => ({
    data: new Uint8Array(raw.subarray(i * size, (i + 1) * size)),
    width: WIDTH,
    height,
  }))
}

describe("webcam detection on fixtures", () => {
  it.each([
    [fixtures.wide, 1920, 1080, { x: 1504, y: 832, w: 384, h: 216 }],
    [fixtures.ultrawide, 2560, 1080, { x: 32, y: 32, w: 384, h: 216 }],
  ])("finds the webcam box in %s", (file, width, height, cam) => {
    const frames = sampleFrames(file, width, height)
    expect(frames.length).toBeGreaterThanOrEqual(6)
    const border = detectOverlayRect(frames)
    expect(border).not.toBeNull()
    const tolerance = 0.025
    expect(Math.abs(border!.rect.x - cam.x / width)).toBeLessThan(tolerance)
    expect(Math.abs(border!.rect.y - cam.y / height)).toBeLessThan(
      tolerance * 2
    )
    expect(Math.abs(border!.rect.w - cam.w / width)).toBeLessThan(tolerance)
    expect(Math.abs(border!.rect.h - cam.h / height)).toBeLessThan(
      tolerance * 2
    )

    const result = combineDetection({
      border,
      faces: [],
      frameCount: frames.length,
      frameAspect: width / height,
    })
    expect(result.mode).toBe("cam-top")
  })
})
