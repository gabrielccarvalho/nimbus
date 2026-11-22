import { z } from "zod"

const unit = z.number().min(0).max(1)

export const rectSchema = z
  .object({ x: unit, y: unit, w: unit, h: unit })
  .refine((r) => r.w > 0 && r.h > 0, { message: "Rect must have a size" })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, {
    message: "Rect must stay inside the frame",
  })
export type Rect = z.infer<typeof rectSchema>

export const layoutModeSchema = z.enum([
  "cam-top",
  "no-cam-blur-fill",
  "no-cam-fill",
  "split-50",
])
export type LayoutMode = z.infer<typeof layoutModeSchema>

export type WebcamLayoutMode = Extract<LayoutMode, "cam-top" | "split-50">

export function usesWebcam(mode: LayoutMode): mode is WebcamLayoutMode {
  return mode === "cam-top" || mode === "split-50"
}

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 }

export const layoutInputSchema = z.object({
  webcamRect: rectSchema.nullable(),
  gameplayRect: rectSchema,
  gameplayFocusX: unit,
  mode: layoutModeSchema,
})
export type LayoutInput = z.infer<typeof layoutInputSchema>
