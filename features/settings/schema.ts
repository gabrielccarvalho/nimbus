import { z } from "zod"

import {
  captionStyleRefSchema,
  defaultProjectSettings,
  selectorModeSchema,
} from "../projects/schema"

export const renderQualitySchema = z.enum(["draft", "standard", "high"])
export type RenderQuality = z.infer<typeof renderQualitySchema>

export const appSettingsSchema = z
  .object({
    transcriptionLanguage: z.string().trim().min(1).max(10),
    selectorMode: selectorModeSchema,
    clipMinMs: z.number().int().min(5_000).max(180_000),
    clipMaxMs: z.number().int().min(5_000).max(180_000),
    targetClipCount: z.number().int().min(1).max(30),
    captionStyle: captionStyleRefSchema,
    captionsEnabled: z.boolean(),
    renderQuality: renderQualitySchema,
    hardwareEncoding: z.boolean(),
    verifyLayoutWithClaude: z.boolean(),
  })
  .refine((s) => s.clipMinMs < s.clipMaxMs, {
    message: "Minimum clip length must be shorter than the maximum",
    path: ["clipMinMs"],
  })
export type AppSettings = z.infer<typeof appSettingsSchema>

export const defaultAppSettings: AppSettings = {
  transcriptionLanguage: "auto",
  selectorMode: defaultProjectSettings.selectorMode,
  clipMinMs: defaultProjectSettings.clipMinMs,
  clipMaxMs: defaultProjectSettings.clipMaxMs,
  targetClipCount: defaultProjectSettings.targetClipCount,
  captionStyle: defaultProjectSettings.captionStyle,
  captionsEnabled: defaultProjectSettings.captionsEnabled,
  renderQuality: "standard",
  hardwareEncoding: false,
  verifyLayoutWithClaude: false,
}

export const renderQualityCrf: Record<RenderQuality, number> = {
  draft: 26,
  standard: 20,
  high: 17,
}
