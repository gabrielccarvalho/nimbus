import { z } from "zod"

import type { CaptionStyle } from "./styles"

export const TEXT_OVERLAY_MAX_CHARS = 80
export const DEFAULT_OVERLAY_MS = 3000
export const MIN_OVERLAY_MS = 500
export const MAX_TEXT_LANES = 4
export const OVERLAY_TOP_Y = 240
export const OVERLAY_MARGIN_X = 90

export const textOverlaySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Write the text or delete it")
      .max(TEXT_OVERLAY_MAX_CHARS),
    position: z.enum(["top", "center"]).default("top"),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    lane: z
      .number()
      .int()
      .min(0)
      .max(MAX_TEXT_LANES - 1)
      .default(0),
  })
  .refine((overlay) => overlay.endMs - overlay.startMs >= MIN_OVERLAY_MS, {
    message: "Keep the text on screen for at least half a second",
    path: ["endMs"],
  })
export type TextOverlay = z.infer<typeof textOverlaySchema>

export const textOverlaysSchema = z.array(textOverlaySchema).max(20)

export function defaultOverlayText(hook: string, title: string) {
  const text = hook.trim() || title.trim() || "Title"
  if (text.length <= TEXT_OVERLAY_MAX_CHARS) return text
  const head = text.slice(0, TEXT_OVERLAY_MAX_CHARS - 1)
  const space = head.lastIndexOf(" ")
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`
}

export function overlayFontSize(style: Pick<CaptionStyle, "fontSize">) {
  return Math.min(192, Math.round(style.fontSize * 1.2))
}

export function overlaysInClip(
  overlays: readonly TextOverlay[],
  clipDurationMs: number
): TextOverlay[] {
  return overlays.flatMap((overlay) => {
    const endMs = Math.min(overlay.endMs, clipDurationMs)
    return endMs - overlay.startMs >= MIN_OVERLAY_MS
      ? [{ ...overlay, endMs }]
      : []
  })
}
