import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

import type { SelectorMode } from "../projects/schema"
import {
  appSettingsSchema,
  defaultAppSettings,
  type AppSettings,
} from "./schema"

const APP_KEY = "app"

export function settingsRepository(db: Db) {
  return {
    get(fallbackSelector?: SelectorMode): AppSettings {
      const row = db
        .select()
        .from(settings)
        .where(eq(settings.key, APP_KEY))
        .get()
      const defaults = fallbackSelector
        ? { ...defaultAppSettings, selectorMode: fallbackSelector }
        : defaultAppSettings
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

    save(value: AppSettings) {
      const parsed = appSettingsSchema.parse(value)
      db.insert(settings)
        .values({ key: APP_KEY, value: parsed })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: parsed, updatedAt: now() },
        })
        .run()
      return parsed
    },
  }
}
