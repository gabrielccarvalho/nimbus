import { describe, expect, it } from "vitest"

import { detectOverlayRect, type GrayFrame } from "./border-heuristic"
import { combineDetection, webcamFromFace } from "./detection"
import { coverCrop, planLayout, toPixels } from "./geometry"
import { FULL_FRAME } from "./schema"

function frame(
  width: number,
  height: number,
  seed: number,
  box?: [number, number, number, number]
): GrayFrame {
  const data = new Uint8ClampedArray(width * height)
  let s = seed
  for (let i = 0; i < data.length; i++) {
    s = (s * 16807) % 2147483647
    data[i] = 40 + (s % 120)
  }
  if (box) {
    const [bx, by, bw, bh] = box
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const border =
          x === bx || x === bx + bw - 1 || y === by || y === by + bh - 1
        data[y * width + x] = border ? 255 : 0
      }
    }
  }
  return { data, width, height }
}

function outline(
  f: GrayFrame,
  [bx, by, bw, bh]: [number, number, number, number],
  gapEvery: number
) {
  const data = f.data as Uint8ClampedArray
  const set = (x: number, y: number, i: number) => {
    if (i % gapEvery !== 0) data[y * f.width + x] = 255
  }
  for (let x = bx; x < bx + bw; x++) {
    set(x, by, x)
    set(x, by + bh - 1, x)
  }
  for (let y = by; y < by + bh; y++) {
    set(bx, y, y)
    set(bx + bw - 1, y, y)
  }
}

describe("detectOverlayRect", () => {
  it("finds a static bordered box over changing content", () => {
    const frames = [1, 2, 3, 4, 5, 6].map((seed) =>
      frame(160, 90, seed, [118, 63, 34, 20])
    )
    const found = detectOverlayRect(frames)!
    expect(found.score).toBeGreaterThan(0.8)
    expect(found.rect.x).toBeCloseTo(118 / 160, 1)
    expect(found.rect.y).toBeCloseTo(63 / 90, 1)
    expect(found.rect.w).toBeCloseTo(34 / 160, 1)
    expect(found.rect.h).toBeCloseTo(20 / 90, 1)
  })

  it("ignores a larger static outline elsewhere in the frame", () => {
    const frames = [1, 2, 3, 4, 5, 6].map((seed) => {
      const f = frame(160, 120, seed, [6, 88, 40, 26])
      outline(f, [50, 6, 80, 70], 7)
      return f
    })
    const found = detectOverlayRect(frames)!
    expect(found.rect.x).toBeCloseTo(6 / 160, 1)
    expect(found.rect.y).toBeCloseTo(88 / 120, 1)
  })

  it("finds nothing convincing in pure noise", () => {
    const found = detectOverlayRect(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => frame(160, 90, seed))
    )
    expect(found?.score ?? 0).toBeLessThan(0.6)
  })

  it("handles no frames", () => {
    expect(detectOverlayRect([])).toBeNull()
  })
})

describe("combineDetection", () => {
  const border = { rect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 }, score: 0.92 }
  const face = { x: 0.85, y: 0.8, w: 0.05, h: 0.09 }

  it("trusts a border with a face inside it", () => {
    expect(
      combineDetection({
        border,
        faces: [face],
        frameCount: 8,
        frameAspect: 16 / 9,
      })
    ).toMatchObject({
      mode: "cam-top",
      webcamRect: border.rect,
      confidence: 0.92,
    })
  })

  it("keeps a strong border without a face at lower confidence", () => {
    expect(
      combineDetection({
        border,
        faces: [],
        frameCount: 8,
        frameAspect: 16 / 9,
      })
    ).toMatchObject({
      mode: "cam-top",
      confidence: 0.74,
    })
  })

  it("builds a webcam rect around a steady face when there's no border", () => {
    const result = combineDetection({
      border: null,
      faces: Array(6).fill(face),
      frameCount: 8,
      frameAspect: 16 / 9,
    })
    expect(result.mode).toBe("cam-top")
    expect(result.webcamRect!.x + result.webcamRect!.w).toBeLessThanOrEqual(1)
    expect(result.confidence).toBeCloseTo(0.65)
  })

  it("falls back to blur fill when unsure", () => {
    expect(
      combineDetection({
        border: { ...border, score: 0.4 },
        faces: [face],
        frameCount: 8,
        frameAspect: 16 / 9,
      })
    ).toMatchObject({ mode: "no-cam-blur-fill" })
  })

  it("keeps face-based rects inside the frame", () => {
    const rect = webcamFromFace({ x: 0.97, y: 0.0, w: 0.04, h: 0.06 }, 16 / 9)
    expect(rect.x + rect.w).toBeLessThanOrEqual(1)
    expect(rect.y).toBeGreaterThanOrEqual(0)
  })
})

const base = {
  webcamRect: null,
  gameplayRect: FULL_FRAME,
  gameplayFocusX: 0.5,
}

describe("layout geometry", () => {
  it("converts to even pixels inside the frame", () => {
    expect(
      toPixels({ x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 }, 1920, 1080)
    ).toEqual({
      x: 1502,
      y: 832,
      w: 384,
      h: 216,
    })
    expect(
      toPixels({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 1921, 1081)
    ).toMatchObject({ w: 192, h: 108 })
  })

  it("cover-crops with a horizontal focus", () => {
    const region = { x: 0, y: 0, w: 2560, h: 1080 }
    expect(coverCrop(region, 1080 / 1248, 0)).toEqual({
      x: 0,
      y: 0,
      w: 934,
      h: 1080,
    })
    expect(coverCrop(region, 1080 / 1248, 1)).toEqual({
      x: 1626,
      y: 0,
      w: 934,
      h: 1080,
    })
    expect(coverCrop({ x: 0, y: 0, w: 384, h: 216 }, 1080 / 960)).toEqual({
      x: 70,
      y: 0,
      w: 242,
      h: 216,
    })
    expect(coverCrop({ x: 10, y: 10, w: 384, h: 216 }, 4)).toEqual({
      x: 10,
      y: 70,
      w: 384,
      h: 96,
    })
  })

  it("plans cam-top, split and blur-fill layouts", () => {
    const camTop = planLayout(
      {
        webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
        gameplayRect: FULL_FRAME,
        gameplayFocusX: 0.5,
        mode: "cam-top",
      },
      1920,
      1080
    )
    expect(camTop).toMatchObject({
      mode: "cam-top",
      regions: [
        { name: "top", outHeight: 672 },
        { name: "bottom", outHeight: 1248, crop: { y: 0, h: 1080, w: 934 } },
      ],
    })
    expect(
      planLayout(
        {
          webcamRect: null,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "cam-top",
        },
        1920,
        1080
      )
    ).toMatchObject({
      mode: "no-cam-blur-fill",
      foreground: { w: 1080, h: 606 },
    })
  })

  it("puts the webcam at the bottom when asked", () => {
    const plan = planLayout(
      {
        webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
        gameplayRect: FULL_FRAME,
        gameplayFocusX: 0.5,
        mode: "cam-top",
        camPosition: "bottom",
      },
      1920,
      1080
    )
    expect(plan).toMatchObject({
      regions: [
        { name: "top", content: "gameplay", outHeight: 1248 },
        { name: "bottom", content: "webcam", outHeight: 672 },
      ],
    })
  })

  it("fits tall sources inside the frame in blur-fill", () => {
    const blur = { ...base, mode: "no-cam-blur-fill" as const }
    expect(planLayout(blur, 1080, 2400)).toMatchObject({
      foreground: { w: 864, h: 1920 },
    })
    expect(planLayout(blur, 1080, 1920)).toMatchObject({
      foreground: { w: 1080, h: 1920 },
    })
  })

  it("fills the frame with a 9:16 gameplay crop that follows the focus", () => {
    const fill = { ...base, mode: "no-cam-fill" as const }
    expect(planLayout({ ...fill, gameplayFocusX: 0.5 }, 1440, 1080)).toEqual({
      mode: "no-cam-fill",
      crop: { x: 416, y: 0, w: 606, h: 1080 },
    })
    expect(
      planLayout({ ...fill, gameplayFocusX: 0 }, 1440, 1080)
    ).toMatchObject({ crop: { x: 0 } })
    expect(
      planLayout({ ...fill, gameplayFocusX: 1 }, 1440, 1080)
    ).toMatchObject({ crop: { x: 834 } })
  })
})
