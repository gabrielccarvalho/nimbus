"use server"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { runAction } from "@/lib/server-action"

import { appSettingsSchema } from "./schema"
import { saveAppSettings } from "./service"

export async function saveSettingsAction(input: unknown) {
  return runAction(
    "saveSettings",
    () => {
      const parsed = appSettingsSchema.safeParse(input)
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Invalid settings"
        )
      }
      return saveAppSettings(getDb(), parsed.data)
    },
    ["/settings"]
  )
}
