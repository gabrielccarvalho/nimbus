import "server-only"

import { connection } from "next/server"

import { getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"

import { chooseEncoder, encoderPreference } from "../render/filtergraph"
import { isEnglishOnlyModel } from "../transcription/language"
import { getAppSettings } from "./service"

export async function getSettingsPage() {
  await connection()
  const env = getEnv()
  const capabilities = await getFfmpegCapabilities(env.FFMPEG_PATH)
  const hardwareEncoder = chooseEncoder(
    encoderPreference(true, env.VIDEO_ENCODER),
    capabilities.encoders
  )
  return {
    settings: await getAppSettings(getDb()),
    claudeAvailable: Boolean(env.ANTHROPIC_API_KEY),
    hardwareEncoder: hardwareEncoder === "libx264" ? null : hardwareEncoder,
    englishOnlyModel:
      env.TRANSCRIBER === "whisper" && isEnglishOnlyModel(env.WHISPER_MODEL),
  }
}

export async function getImportDefaults() {
  await connection()
  const settings = await getAppSettings(getDb())
  return {
    defaults: {
      language: settings.language,
      selectorMode: settings.selectorMode,
    },
    claudeAvailable: Boolean(getEnv().ANTHROPIC_API_KEY),
  }
}
