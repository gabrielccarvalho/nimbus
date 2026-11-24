import {
  coverCrop,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  planLayout,
  toPixels,
} from "../layout/geometry"
import { usesWebcam, type LayoutInput } from "../layout/schema"
import type { Effect } from "./schema"

type ShakeIntensity = Extract<Effect, { kind: "shake" }>["intensity"]

export const ZOOM_EASE_MS = 150

export const SHAKE_SCALE = { light: 1.06, strong: 1.12 } satisfies Record<
  ShakeIntensity,
  number
>

const SHAKE_AMPLITUDE = { light: 0.03, strong: 0.06 } satisfies Record<
  ShakeIntensity,
  number
>
// Stays below Nyquist for a ~30 fps render.
const SHAKE_HZ = 12
const SHAKE_RADIANS_PER_MS = (2 * Math.PI * SHAKE_HZ) / 1000

export type FloatRect = { x: number; y: number; w: number; h: number }
export type FrameRegion = { crop: FloatRect; dest: FloatRect; blur?: true }
export type Frame = { regions: FrameRegion[] }

type Planned = FrameRegion & { zoomable: boolean }

const FULL_OUTPUT = { x: 0, y: 0, w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT }

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max)

export function activeEffect<K extends Effect["kind"]>(
  events: readonly Effect[],
  kind: K,
  tMs: number
) {
  return events.find(
    (event): event is Extract<Effect, { kind: K }> =>
      event.kind === kind && event.startMs <= tMs && tMs < event.endMs
  )
}

function baseRegions(
  layout: LayoutInput,
  source: { width: number; height: number }
): Planned[] {
  const plan = planLayout(layout, source.width, source.height)
  if (plan.mode === "no-cam-fill") {
    return [{ crop: plan.crop, dest: FULL_OUTPUT, zoomable: true }]
  }
  if (plan.mode === "no-cam-blur-fill") {
    const { w, h } = plan.foreground
    return [
      {
        crop: plan.background,
        dest: FULL_OUTPUT,
        blur: true,
        zoomable: false,
      },
      {
        crop: { x: 0, y: 0, w: source.width, h: source.height },
        dest: {
          x: Math.floor((OUTPUT_WIDTH - w) / 2),
          y: Math.floor((OUTPUT_HEIGHT - h) / 2),
          w,
          h,
        },
        zoomable: true,
      },
    ]
  }
  const [top, bottom] = plan.regions
  return [
    {
      crop: top.crop,
      dest: { x: 0, y: 0, w: OUTPUT_WIDTH, h: top.outHeight },
      zoomable: top.content === "gameplay",
    },
    {
      crop: bottom.crop,
      dest: { x: 0, y: top.outHeight, w: OUTPUT_WIDTH, h: bottom.outHeight },
      zoomable: bottom.content === "gameplay",
    },
  ]
}

function zoomScale(
  zoom: Extract<Effect, { kind: "zoom" }>,
  tMs: number
): number {
  const ramp = Math.min(
    1,
    (tMs - zoom.startMs) / ZOOM_EASE_MS,
    (zoom.endMs - tMs) / ZOOM_EASE_MS
  )
  return 1 + (zoom.scale - 1) * ramp
}

function zoomCrop(
  crop: FloatRect,
  scale: number,
  focus: { x: number; y: number }
): FloatRect {
  const w = crop.w / scale
  const h = crop.h / scale
  return {
    x: clamp(crop.x + focus.x * crop.w - w / 2, crop.x, crop.x + crop.w - w),
    y: clamp(crop.y + focus.y * crop.h - h / 2, crop.y, crop.y + crop.h - h),
    w,
    h,
  }
}

function shakeCrop(
  crop: FloatRect,
  shake: Extract<Effect, { kind: "shake" }>,
  tMs: number
): FloatRect {
  const progress = (tMs - shake.startMs) / (shake.endMs - shake.startMs)
  const amplitude = SHAKE_AMPLITUDE[shake.intensity] * (1 - progress)
  const angle = tMs * SHAKE_RADIANS_PER_MS
  const w = crop.w / SHAKE_SCALE[shake.intensity]
  const h = crop.h / SHAKE_SCALE[shake.intensity]
  const x = crop.x + (crop.w - w) / 2 + amplitude * w * Math.sin(angle)
  const y = crop.y + (crop.h - h) / 2 + amplitude * h * Math.cos(angle + 0.7)
  return {
    x: clamp(x, crop.x, crop.x + crop.w - w),
    y: clamp(y, crop.y, crop.y + crop.h - h),
    w,
    h,
  }
}

export function frameAt(
  layout: LayoutInput,
  source: { width: number; height: number },
  events: readonly Effect[],
  tMs: number
): Frame {
  const shake = activeEffect(events, "shake", tMs)
  const withShake = (region: FrameRegion): FrameRegion =>
    shake ? { ...region, crop: shakeCrop(region.crop, shake, tMs) } : region

  if (
    usesWebcam(layout.mode) &&
    layout.webcamRect &&
    activeEffect(events, "focus", tMs)
  ) {
    const crop = coverCrop(
      toPixels(layout.webcamRect, source.width, source.height),
      OUTPUT_WIDTH / OUTPUT_HEIGHT
    )
    return { regions: [withShake({ crop, dest: FULL_OUTPUT })] }
  }

  const zoom = activeEffect(events, "zoom", tMs)
  return {
    regions: baseRegions(layout, source).map(({ zoomable, ...region }) =>
      withShake(
        zoom && zoomable
          ? {
              ...region,
              crop: zoomCrop(region.crop, zoomScale(zoom, tMs), zoom.focus),
            }
          : region
      )
    ),
  }
}
