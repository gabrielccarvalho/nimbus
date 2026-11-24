import { z } from "zod"

import type { TimeRange } from "../analysis/schema"

export const MIN_EFFECT_MS = 100

const ms = z.number().int().nonnegative()
const unit = z.number().min(0).max(1)

export const effectSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("focus"),
      startMs: ms,
      endMs: ms,
      target: z.enum(["cam", "game"]).default("cam"),
    }),
    z.object({
      kind: z.literal("zoom"),
      startMs: ms,
      endMs: ms,
      scale: z.number().min(1.1).max(2).default(1.4),
      focus: z.object({ x: unit, y: unit }).default({ x: 0.5, y: 0.5 }),
    }),
    z.object({
      kind: z.literal("shake"),
      startMs: ms,
      endMs: ms,
      intensity: z.enum(["light", "strong"]).default("light"),
    }),
  ])
  .refine((effect) => effect.endMs > effect.startMs, {
    message: "Effect must end after it starts",
    path: ["endMs"],
  })
export type Effect = z.infer<typeof effectSchema>

export const clipEffectsSchema = z.object({
  events: z.array(effectSchema).max(60),
  edited: z.boolean(),
})
export type ClipEffects = z.infer<typeof clipEffectsSchema>

export const beatSchema = z.object({
  ms,
  kind: z.enum(["reaction", "weird"]),
  x: unit.optional(),
  y: unit.optional(),
})
export type Beat = z.infer<typeof beatSchema>

export function normalizeEffects(
  events: readonly Effect[],
  range: TimeRange
): Effect[] {
  const clipped = events
    .map((event) => ({
      ...event,
      startMs: Math.max(event.startMs, range.startMs),
      endMs: Math.min(event.endMs, range.endMs),
    }))
    .filter((event) => event.endMs - event.startMs >= MIN_EFFECT_MS)
    .sort((a, b) => a.startMs - b.startMs)

  const lastEnd = new Map<Effect["kind"], number>()
  const result: Effect[] = []
  for (const event of clipped) {
    const startMs = Math.max(event.startMs, lastEnd.get(event.kind) ?? 0)
    if (event.endMs - startMs < MIN_EFFECT_MS) continue
    lastEnd.set(event.kind, event.endMs)
    result.push({ ...event, startMs })
  }
  return result
}
