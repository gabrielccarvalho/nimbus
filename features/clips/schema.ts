import { z } from "zod"

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
