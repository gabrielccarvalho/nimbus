import "server-only"

import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"

import { settingsRepository } from "./repository"
import type { AppSettings } from "./schema"

export function envDefaults(): Partial<AppSettings> {
  const env = getEnv()
  return {
    selectorMode: env.HIGHLIGHT_SELECTOR,
    language: env.WHISPER_LANGUAGE,
    hardwareEncoding: env.VIDEO_ENCODER !== "libx264",
  }
}

export function getAppSettings(db: Db, workspaceId: string | null = null) {
  return settingsRepository(db, workspaceId).get(envDefaults())
}

export function saveAppSettings(
  db: Db,
  value: AppSettings,
  workspaceId: string | null = null
) {
  return settingsRepository(db, workspaceId).save(value)
}
