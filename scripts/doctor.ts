import "@/lib/load-env"

import { access, constants, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { runProcess } from "@/lib/process/run"

type Level = "ok" | "warn" | "fail"
type Check = { name: string; level: Level; detail: string }

const checks: Check[] = []
const add = (name: string, level: Level, detail: string) =>
  checks.push({ name, level, detail })

async function main() {
  const strict = process.argv.includes("--strict")

  const [major] = process.versions.node.split(".").map(Number)
  add(
    "node",
    (major ?? 0) >= 22 ? "ok" : "fail",
    `v${process.versions.node} (needs ≥ 22)`
  )

  let env: ReturnType<typeof getEnv>
  try {
    env = getEnv()
    add("env", "ok", "valid")
  } catch (error) {
    add("env", "fail", String(error))
    return finish(strict)
  }

  const caps = await getFfmpegCapabilities(env.FFMPEG_PATH)
  add(
    "ffmpeg",
    caps.available ? "ok" : "fail",
    caps.available
      ? `${env.FFMPEG_PATH} ${caps.version}`
      : `${env.FFMPEG_PATH} not found`
  )
  if (caps.available) {
    add(
      "libx264",
      caps.hasLibx264 ? "ok" : "fail",
      caps.hasLibx264 ? "available" : "missing encoder libx264"
    )
    add(
      "libass",
      caps.hasLibass ? "ok" : "warn",
      caps.hasLibass
        ? "ass filter available"
        : "no ass filter: captions can't be burned in (see README → ffmpeg with libass)"
    )
    for (const filter of ["silencedetect", "ebur128"]) {
      add(
        filter,
        caps.filters.has(filter) ? "ok" : "fail",
        caps.filters.has(filter) ? "available" : "missing"
      )
    }
    add(
      "hw encoders",
      "ok",
      caps.hardwareEncoders.length
        ? caps.hardwareEncoders.join(", ")
        : "none (software only)"
    )
  }

  try {
    const probe = await runProcess(env.FFPROBE_PATH, ["-version"], {
      timeoutMs: 10_000,
    })
    add("ffprobe", probe.code === 0 ? "ok" : "fail", env.FFPROBE_PATH)
  } catch {
    add("ffprobe", "fail", `${env.FFPROBE_PATH} not found`)
  }

  const transcriberLevel: Level =
    env.TRANSCRIBER === "whisper" ? "fail" : "warn"
  try {
    const whisper = await runProcess(env.WHISPER_BIN, ["--help"], {
      timeoutMs: 10_000,
    })
    add(
      "whisper.cpp",
      whisper.code === 0 ? "ok" : transcriberLevel,
      env.WHISPER_BIN
    )
  } catch {
    add(
      "whisper.cpp",
      transcriberLevel,
      `${env.WHISPER_BIN} not found (TRANSCRIBER=${env.TRANSCRIBER})`
    )
  }
  try {
    await access(path.resolve(env.WHISPER_MODEL), constants.R_OK)
    add("whisper model", "ok", env.WHISPER_MODEL)
  } catch {
    add("whisper model", transcriberLevel, `${env.WHISPER_MODEL} not readable`)
  }

  add(
    "anthropic",
    env.ANTHROPIC_API_KEY
      ? "ok"
      : env.HIGHLIGHT_SELECTOR === "anthropic"
        ? "fail"
        : "warn",
    env.ANTHROPIC_API_KEY
      ? `key configured, model ${env.ANTHROPIC_MODEL}`
      : "ANTHROPIC_API_KEY missing"
  )

  try {
    await mkdir(env.DATA_DIR, { recursive: true })
    const probeFile = path.join(env.DATA_DIR, `.doctor-${process.pid}`)
    await writeFile(probeFile, "ok")
    await rm(probeFile)
    add("data dir", "ok", `${env.DATA_DIR} writable`)
  } catch (error) {
    add("data dir", "fail", `${env.DATA_DIR}: ${String(error)}`)
  }

  finish(strict)
}

function finish(strict: boolean) {
  const icon: Record<Level, string> = { ok: "✔", warn: "!", fail: "✖" }
  const width = Math.max(...checks.map((c) => c.name.length))
  for (const check of checks) {
    console.log(
      `${icon[check.level]} ${check.name.padEnd(width)}  ${check.detail}`
    )
  }
  const failed = checks.some(
    (c) => c.level === "fail" || (strict && c.level === "warn")
  )
  process.exitCode = failed ? 1 : 0
}

void main()
