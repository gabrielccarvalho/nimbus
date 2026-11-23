"use server"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"

import { layoutInputSchema } from "./schema"
import { confirmLayout } from "./service"

const confirmSchema = z.object({
  layout: layoutInputSchema,
  confidence: z.number().min(0).max(1).optional(),
  savePreset: z.boolean().optional(),
})

export async function confirmLayoutAction(projectId: unknown, input: unknown) {
  const id = parseId(projectId, "project id")
  return runAction(
    "confirmLayout",
    async () => {
      const parsed = confirmSchema.safeParse(input)
      if (!parsed.success) throw new AppError("VALIDATION", "Invalid layout")
      const { layout, ...options } = parsed.data
      await confirmLayout(getDb(), id, layout, options)
    },
    [`/projects/${id}`]
  )
}
