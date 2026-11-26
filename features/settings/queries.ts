import "server-only"

import { installedCaptionFonts } from "@/features/render/fonts"

import { connection } from "next/server"

import { getDb, type Db } from "@/lib/db"
import { getEnv } from "@/lib/env"

import { requireViewer } from "../accounts/session"
import { claudeAvailable } from "../accounts/usage"
import { latestWorker } from "../jobs/heartbeat"
import {
  chooseEncoder,
  encoderPreference,
  type Encoder,
} from "../render/filtergraph"
import { isEnglishOnlyModel } from "../transcription/language"
import { getAppSettings } from "./service"

export async function getRenderingCapabilities(
  db: Db,
  videoEncoder: "auto" | Encoder,
  now = new Date()
) {
  const worker = await latestWorker(db, now)
  if (!worker) return { workerOnline: false, hardwareEncoder: null }
  const encoder = chooseEncoder(
    encoderPreference(true, videoEncoder),
    new Set(worker.capabilities.encoders)
  )
  return {
    workerOnline: true,
    hardwareEncoder: encoder === "libx264" ? null : encoder,
  }
}

export async function getSettingsPage() {
  await connection()
  const { workspace } = await requireViewer()
  const env = getEnv()
  const db = getDb()
  return {
    settings: await getAppSettings(db, workspace.id),
    claudeAvailable: claudeAvailable(workspace),
    ...(await getRenderingCapabilities(db, env.VIDEO_ENCODER)),
    englishOnlyModel:
      env.TRANSCRIBER === "whisper" && isEnglishOnlyModel(env.WHISPER_MODEL),
    installedFonts: installedCaptionFonts(),
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
