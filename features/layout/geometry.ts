import {
  usesWebcam,
  type LayoutInput,
  type LayoutMode,
  type Rect,
  type WebcamLayoutMode,
} from "./schema"

export const OUTPUT_WIDTH = 1080
export const OUTPUT_HEIGHT = 1920

export const SPLIT_HEIGHTS: Record<WebcamLayoutMode, [number, number]> = {
  "cam-top": [672, 1248],
  "split-50": [960, 960],
}

export type PixelRect = { x: number; y: number; w: number; h: number }

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)
const evenFloor = (n: number) => Math.max(0, Math.floor(n / 2) * 2)

export function toPixels(rect: Rect, width: number, height: number): PixelRect {
  const x = evenFloor(rect.x * width)
  const y = evenFloor(rect.y * height)
  return {
    x,
    y,
    w: Math.min(even(rect.w * width), evenFloor(width - x)),
    h: Math.min(even(rect.h * height), evenFloor(height - y)),
  }
}

export function coverCrop(
  region: PixelRect,
  aspect: number,
  focusX = 0.5
): PixelRect {
  if (region.w / region.h > aspect) {
    const w = Math.min(region.w, even(region.h * aspect))
    const slack = region.w - w
    return {
      x: region.x + evenFloor(slack * focusX),
      y: region.y,
      w,
      h: region.h,
    }
  }
  const h = Math.min(region.h, even(region.w / aspect))
  return {
    x: region.x,
    y: region.y + evenFloor((region.h - h) / 2),
    w: region.w,
    h,
  }
}

export type LayoutRegion = {
  name: "top" | "bottom"
  content: "webcam" | "gameplay"
  crop: PixelRect
  outHeight: number
}

export type LayoutPlan =
  | {
      mode: "no-cam-blur-fill"
      background: PixelRect
      foreground: { w: number; h: number }
    }
  | { mode: "no-cam-fill"; crop: PixelRect }
  | { mode: WebcamLayoutMode; regions: [LayoutRegion, LayoutRegion] }

export function planLayout(
  layout: LayoutInput,
  width: number,
  height: number
): LayoutPlan {
  const full = { x: 0, y: 0, w: evenFloor(width), h: evenFloor(height) }
  if (layout.mode === "no-cam-fill") {
    return {
      mode: "no-cam-fill",
      crop: coverCrop(
        toPixels(layout.gameplayRect, width, height),
        OUTPUT_WIDTH / OUTPUT_HEIGHT,
        layout.gameplayFocusX
      ),
    }
  }
  if (!usesWebcam(layout.mode) || !layout.webcamRect) {
    const scale = Math.min(OUTPUT_WIDTH / width, OUTPUT_HEIGHT / height)
    return {
      mode: "no-cam-blur-fill",
      background: coverCrop(full, OUTPUT_WIDTH / OUTPUT_HEIGHT),
      foreground: { w: even(width * scale), h: even(height * scale) },
    }
  }
  const [camHeight, gameplayHeight] = SPLIT_HEIGHTS[layout.mode]
  const cam = {
    content: "webcam" as const,
    crop: coverCrop(
      toPixels(layout.webcamRect, width, height),
      OUTPUT_WIDTH / camHeight
    ),
    outHeight: camHeight,
  }
  const gameplay = {
    content: "gameplay" as const,
    crop: coverCrop(
      toPixels(layout.gameplayRect, width, height),
      OUTPUT_WIDTH / gameplayHeight,
      layout.gameplayFocusX
    ),
    outHeight: gameplayHeight,
  }
  return {
    mode: layout.mode,
    regions:
      layout.camPosition === "bottom"
        ? [
            { name: "top", ...gameplay },
            { name: "bottom", ...cam },
          ]
        : [
            { name: "top", ...cam },
            { name: "bottom", ...gameplay },
          ],
  }
}

export function gameplaySlotAspect(mode: LayoutMode): number | null {
  if (mode === "no-cam-blur-fill") return null
  if (mode === "no-cam-fill") return OUTPUT_WIDTH / OUTPUT_HEIGHT
  return OUTPUT_WIDTH / SPLIT_HEIGHTS[mode][1]
}

export function gameplayBox(
  layout: LayoutInput,
  width: number,
  height: number
): Rect | null {
  const plan = planLayout(layout, width, height)
  const crop =
    plan.mode === "no-cam-fill"
      ? plan.crop
      : "regions" in plan
        ? plan.regions.find((r) => r.content === "gameplay")?.crop
        : undefined
  if (!crop) return null
  const aspect = gameplaySlotAspect(layout.mode)!
  const stored = layout.gameplayRect
  const storedAspect = (stored.w * width) / (stored.h * height)
  if (Math.abs(storedAspect / aspect - 1) <= 0.01) return stored
  return {
    x: crop.x / width,
    y: crop.y / height,
    w: crop.w / width,
    h: crop.h / height,
  }
}

export function fitRectToAspect(
  rect: Rect,
  aspect: number,
  width: number,
  height: number
): Rect {
  const area = rect.w * width * rect.h * height
  const pixelW = Math.sqrt(area * aspect)
  const pixelH = pixelW / aspect
  const scale = Math.min(1, width / pixelW, height / pixelH)
  const w = (pixelW * scale) / width
  const h = (pixelH * scale) / height
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  return {
    x: clamp(rect.x + rect.w / 2 - w / 2, 1 - w),
    y: clamp(rect.y + rect.h / 2 - h / 2, 1 - h),
    w,
    h,
  }
}
