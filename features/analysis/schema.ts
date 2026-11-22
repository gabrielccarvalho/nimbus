import { z } from "zod"

export const timeRangeSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})
export type TimeRange = z.infer<typeof timeRangeSchema>

export const densityWindowSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  wordsPerSecond: z.number().nonnegative(),
})
export type DensityWindow = z.infer<typeof densityWindowSchema>

export const signalsSchema = z.object({
  silences: z.array(timeRangeSchema),
  loudness: z.array(z.number()),
  loudnessIntervalMs: z.number().int().positive(),
  speechDensity: z.array(densityWindowSchema),
})
export type SignalsData = z.infer<typeof signalsSchema>

export const LOUDNESS_FLOOR_LUFS = -70
