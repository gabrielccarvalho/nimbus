import "server-only"

import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"

import { settingsRepository } from "./repository"
import type { AppSettings } from "./schema"

export function envDefaults(): Partial<AppSettings> {
  const env = getEnv()
  return {
    selectorMode: env.HIGHLIGHT_SELECTOR,
    transcriptionLanguage: env.WHISPER_LANGUAGE,
    hardwareEncoding: env.VIDEO_ENCODER !== "libx264",
  }
}

export function getAppSettings(db: Db) {
  return settingsRepository(db).get(envDefaults())
}

export function saveAppSettings(db: Db, value: AppSettings) {
  return settingsRepository(db).save(value)
}
