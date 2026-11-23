import "server-only"

import { connection } from "next/server"

import { getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"

import { chooseEncoder, encoderPreference } from "../render/filtergraph"
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
    englishOnlyModel: /\.en\.bin$/.test(env.WHISPER_MODEL),
  }
}
