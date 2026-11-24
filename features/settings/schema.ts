import { z } from "zod"

import { nicheSchema } from "../highlights/niches"

import {
  captionStyleRefSchema,
  defaultProjectSettings,
  languageSchema,
  reactionPhrasesSchema,
  renderQualitySchema,
  selectorModeSchema,
  type RenderQuality,
} from "../projects/schema"

export { renderQualitySchema, type RenderQuality }

export const appSettingsSchema = z
  .object({
    language: languageSchema,
    selectorMode: selectorModeSchema,
    clipMinMs: z.number().int().min(5_000).max(180_000),
    clipMaxMs: z.number().int().min(5_000).max(180_000),
    targetClipCount: z.number().int().min(1).max(30),
    captionStyle: captionStyleRefSchema,
    captionsEnabled: z.boolean(),
    renderQuality: renderQualitySchema,
    reactionPhrases: reactionPhrasesSchema,
    niche: nicheSchema,
    autoEffects: z.boolean(),
    hardwareEncoding: z.boolean(),
  })
  .refine((s) => s.clipMinMs < s.clipMaxMs, {
    message: "Minimum clip length must be shorter than the maximum",
    path: ["clipMinMs"],
  })
export type AppSettings = z.infer<typeof appSettingsSchema>

export const defaultAppSettings: AppSettings = {
  language: defaultProjectSettings.language,
  selectorMode: defaultProjectSettings.selectorMode,
  clipMinMs: defaultProjectSettings.clipMinMs,
  clipMaxMs: defaultProjectSettings.clipMaxMs,
  targetClipCount: defaultProjectSettings.targetClipCount,
  captionStyle: defaultProjectSettings.captionStyle,
  captionsEnabled: defaultProjectSettings.captionsEnabled,
  renderQuality: defaultProjectSettings.renderQuality,
  reactionPhrases: defaultProjectSettings.reactionPhrases,
  niche: defaultProjectSettings.niche,
  autoEffects: defaultProjectSettings.autoEffects,
  hardwareEncoding: false,
}

export const renderQualityCrf: Record<RenderQuality, number> = {
  draft: 26,
  standard: 20,
  high: 17,
}
