import "server-only"

import { connection } from "next/server"

import { getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"

import { requireViewer } from "../accounts/session"
import { claudeAvailable } from "../accounts/usage"
import { chooseEncoder, encoderPreference } from "../render/filtergraph"
import { isEnglishOnlyModel } from "../transcription/language"
import { getAppSettings } from "./service"

export async function getSettingsPage() {
  await connection()
  const { workspace } = await requireViewer()
  const env = getEnv()
  const capabilities = await getFfmpegCapabilities(env.FFMPEG_PATH)
  const hardwareEncoder = chooseEncoder(
    encoderPreference(true, env.VIDEO_ENCODER),
    capabilities.encoders
  )
  return {
    settings: await getAppSettings(getDb(), workspace.id),
    claudeAvailable: claudeAvailable(workspace),
    hardwareEncoder: hardwareEncoder === "libx264" ? null : hardwareEncoder,
    englishOnlyModel:
      env.TRANSCRIBER === "whisper" && isEnglishOnlyModel(env.WHISPER_MODEL),
  }
}

export async function getImportDefaults() {
  await connection()
  const { workspace } = await requireViewer()
  const settings = await getAppSettings(getDb(), workspace.id)
  return {
    defaults: {
      language: settings.language,
      selectorMode: settings.selectorMode,
    },
    claudeAvailable: claudeAvailable(workspace),
  }
}
