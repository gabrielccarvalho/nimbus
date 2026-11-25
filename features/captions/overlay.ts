import { z } from "zod"

import type { CaptionStyle } from "./styles"

export const TEXT_OVERLAY_MAX_CHARS = 80
export const DEFAULT_OVERLAY_UNTIL_MS = 3000
export const OVERLAY_TOP_Y = 240
export const OVERLAY_MARGIN_X = 90

export const textOverlaySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Add the on-screen text or turn it off")
    .max(TEXT_OVERLAY_MAX_CHARS),
  position: z.enum(["top", "center"]).default("top"),
  untilMs: z
    .number()
    .int()
    .min(500)
    .max(180_000)
    .nullable()
    .default(DEFAULT_OVERLAY_UNTIL_MS),
})
export type TextOverlay = z.infer<typeof textOverlaySchema>

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

export function overlayEndMs(
  overlay: Pick<TextOverlay, "untilMs">,
  clipDurationMs: number
) {
  return overlay.untilMs === null
    ? clipDurationMs
    : Math.min(overlay.untilMs, clipDurationMs)
}
