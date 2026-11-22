import { z } from "zod"

export const projectStatuses = [
  "uploaded",
  "probing",
  "transcribing",
  "analyzing",
  "selecting",
  "awaiting_layout",
  "ready_for_review",
  "rendering",
  "done",
  "failed",
  "cancelled",
] as const

export const projectStatusSchema = z.enum(projectStatuses)
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const selectorModeSchema = z.enum(["anthropic", "manual", "heuristic"])
export type SelectorMode = z.infer<typeof selectorModeSchema>

export const captionStyleRefSchema = z.object({
  presetId: z.string().min(1),
  overrides: z.record(z.string(), z.unknown()).default({}),
})

export const projectSettingsSchema = z
  .object({
    selectorMode: selectorModeSchema,
    clipMinMs: z.number().int().min(5_000).max(180_000),
    clipMaxMs: z.number().int().min(5_000).max(180_000),
    targetClipCount: z.number().int().min(1).max(30),
    captionStyle: captionStyleRefSchema,
    captionsEnabled: z.boolean(),
  })
  .refine((s) => s.clipMinMs < s.clipMaxMs, {
    message: "Minimum clip length must be shorter than the maximum",
    path: ["clipMinMs"],
  })
export type ProjectSettings = z.infer<typeof projectSettingsSchema>

export const defaultProjectSettings: ProjectSettings = {
  selectorMode: "heuristic",
  clipMinMs: 15_000,
  clipMaxMs: 60_000,
  targetClipCount: 12,
  captionStyle: { presetId: "punch", overrides: {} },
  captionsEnabled: true,
}

export const projectNameSchema = z.string().trim().min(1).max(120)

export const sourceAspectSchema = z.enum(["16:9", "21:9", "other"])
export type SourceAspect = z.infer<typeof sourceAspectSchema>

export const assetKinds = [
  "source",
  "audio",
  "thumbnail",
  "proxy",
  "render",
  "subtitle",
] as const
export const assetKindSchema = z.enum(assetKinds)
export type AssetKind = z.infer<typeof assetKindSchema>
