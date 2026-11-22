import type { LayoutInput, LayoutMode, Rect } from "./schema"

export const OUTPUT_WIDTH = 1080
export const OUTPUT_HEIGHT = 1920

export const SPLIT_HEIGHTS: Record<
  Exclude<LayoutMode, "no-cam-blur-fill">,
  [number, number]
> = {
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
  crop: PixelRect
  outHeight: number
}

export type LayoutPlan =
  | {
      mode: "no-cam-blur-fill"
      background: PixelRect
      foregroundHeight: number
    }
  | { mode: "cam-top" | "split-50"; regions: [LayoutRegion, LayoutRegion] }

export function planLayout(
  layout: LayoutInput,
  width: number,
  height: number
): LayoutPlan {
  const full = { x: 0, y: 0, w: evenFloor(width), h: evenFloor(height) }
  if (layout.mode === "no-cam-blur-fill" || !layout.webcamRect) {
    return {
      mode: "no-cam-blur-fill",
      background: coverCrop(full, OUTPUT_WIDTH / OUTPUT_HEIGHT),
      foregroundHeight: even((OUTPUT_WIDTH / width) * height),
    }
  }
  const [top, bottom] = SPLIT_HEIGHTS[layout.mode]
  return {
    mode: layout.mode,
    regions: [
      {
        name: "top",
        crop: coverCrop(
          toPixels(layout.webcamRect, width, height),
          OUTPUT_WIDTH / top
        ),
        outHeight: top,
      },
      {
        name: "bottom",
        crop: coverCrop(
          toPixels(layout.gameplayRect, width, height),
          OUTPUT_WIDTH / bottom,
          layout.gameplayFocusX
        ),
        outHeight: bottom,
      },
    ],
  }
}
