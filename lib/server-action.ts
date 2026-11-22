import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { AppError, err, ok, type Result } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const idSchema = z.string().min(1).max(64)

export function parseId(input: unknown, label = "id") {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) throw new AppError("VALIDATION", `Invalid ${label}`)
  return parsed.data
}

export async function runAction<T>(
  name: string,
  fn: () => T | Promise<T>,
  paths: string[]
): Promise<Result<T>> {
  try {
    const value = await fn()
    for (const path of paths) revalidatePath(path, "layout")
    return ok(value)
  } catch (error) {
    logger.warn({ err: error, action: name }, "action failed")
    return err(error)
  }
}
