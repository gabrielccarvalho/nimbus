import { z } from "zod"

import { textOverlaySchema } from "../captions/overlay"
import { clipEffectsSchema } from "../effects/schema"
import { layoutInputSchema } from "../layout/schema"
import { audioMixSchema } from "../music/schema"

export const clipStatuses = [
  "candidate",
  "approved",
  "rejected",
  "rendering",
  "rendered",
  "failed",
] as const
export const clipStatusSchema = z.enum(clipStatuses)
export type ClipStatus = z.infer<typeof clipStatusSchema>

export const CAPTION_MAX_OFFSET_MS = 5_000

export const captionPageOverrideSchema = z
  .object({
    index: z.number().int().nonnegative(),
    text: z.string().max(200).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().positive().optional(),
  })
  .refine(
    (page) =>
      page.startMs === undefined ||
      page.endMs === undefined ||
      page.endMs > page.startMs,
    { message: "A caption must end after it starts", path: ["endMs"] }
  )

export const captionOverridesSchema = z.object({
  enabled: z.boolean().optional(),
  offsetMs: z
    .number()
    .int()
    .min(-CAPTION_MAX_OFFSET_MS)
    .max(CAPTION_MAX_OFFSET_MS)
    .optional(),
  pages: z.array(captionPageOverrideSchema).default([]),
  style: z
    .object({
      presetId: z.string().min(1),
      overrides: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
})
export type CaptionOverrides = z.infer<typeof captionOverridesSchema>

export const clipTextSchema = z.object({
  title: z.string().trim().min(1).max(100),
  hook: z.string().trim().max(200),
})

export const CLIP_MIN_EDIT_MS = 3_000
export const CLIP_MAX_EDIT_MS = 180_000

export const clipEditSchema = clipTextSchema.extend({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  captionOverrides: captionOverridesSchema,
  layoutOverride: layoutInputSchema.nullable().default(null),
  effects: clipEffectsSchema.nullable().default(null),
  audioMix: audioMixSchema.nullable().default(null),
  textOverlay: textOverlaySchema.nullable().default(null),
})
export type ClipEdit = z.infer<typeof clipEditSchema>

export const clipPlanSchema = clipEditSchema
  .pick({ startMs: true, endMs: true, layoutOverride: true })
  .refine((plan) => plan.endMs > plan.startMs, {
    message: "The clip must end after it starts",
    path: ["endMs"],
  })
export type ClipPlan = z.infer<typeof clipPlanSchema>

export const clipRangeSchema = clipEditSchema
  .pick({ startMs: true, endMs: true })
  .refine((range) => range.endMs > range.startMs, {
    message: "The clip must end after it starts",
    path: ["endMs"],
  })
export type ClipRange = z.infer<typeof clipRangeSchema>
