import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

import {
  appSettingsSchema,
  defaultAppSettings,
  type AppSettings,
} from "./schema"

const APP_KEY = "app"

export function settingsRepository(db: Db) {
  return {
    async get(fallbacks: Partial<AppSettings> = {}): Promise<AppSettings> {
      const [row] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, APP_KEY))
      const defaults = { ...defaultAppSettings, ...fallbacks }
      if (!row) return defaults
      const parsed = appSettingsSchema.safeParse({
        ...defaults,
        ...(row.value as object),
      })
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues }, "invalid stored settings")
        return defaults
      }
      return parsed.data
    },

    async save(value: AppSettings): Promise<AppSettings> {
      const parsed = appSettingsSchema.parse(value)
      await db
        .insert(settings)
        .values({ key: APP_KEY, value: parsed })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: parsed, updatedAt: now() },
        })
      return parsed
    },
  }
}
