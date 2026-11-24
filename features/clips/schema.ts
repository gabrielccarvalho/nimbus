import { z } from "zod"

import { clipEffectsSchema } from "../effects/schema"
import { layoutInputSchema } from "../layout/schema"

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

export const captionPageOverrideSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().max(200),
})

export const captionOverridesSchema = z.object({
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
})
export type ClipEdit = z.infer<typeof clipEditSchema>

export const clipPlanSchema = clipEditSchema
  .pick({ startMs: true, endMs: true, layoutOverride: true })
  .refine((plan) => plan.endMs > plan.startMs, {
    message: "The clip must end after it starts",
    path: ["endMs"],
  })
export type ClipPlan = z.infer<typeof clipPlanSchema>
