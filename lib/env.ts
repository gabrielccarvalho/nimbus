import "server-only"

import path from "node:path"
import { z } from "zod"

const booleanish = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1")

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATA_DIR: z.string().min(1).default("./data"),
  DATABASE_PATH: z.string().min(1).optional(),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  WHISPER_BIN: z.string().min(1).default("whisper-cli"),
  WHISPER_MODEL: z.string().min(1).default("./models/ggml-base.en.bin"),
  WHISPER_LANGUAGE: z.string().min(1).default("auto"),
  WHISPER_THREADS: z.coerce.number().int().positive().default(4),
  TRANSCRIBER: z.enum(["whisper", "fake"]).default("whisper"),
  HIGHLIGHT_SELECTOR: z
    .enum(["anthropic", "manual", "heuristic"])
    .default("heuristic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  ANTHROPIC_BASE_URL: z.url().optional(),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 ** 3),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_RENDER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .optional(),
  E2E: booleanish,
})

type RawEnv = z.infer<typeof envSchema>

export type Env = Omit<RawEnv, "DATABASE_PATH" | "DATA_DIR"> & {
  DATA_DIR: string
  DATABASE_PATH: string
}

let cached: Env | undefined

export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== "")
  )
  const raw = envSchema.parse(cleaned)
  const dataDir = path.resolve(/* turbopackIgnore: true */ raw.DATA_DIR)
  return {
    ...raw,
    DATA_DIR: dataDir,
    DATABASE_PATH: path.resolve(
      /* turbopackIgnore: true */
      raw.DATABASE_PATH ?? path.join(dataDir, "app.db")
    ),
  }
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}

export function resetEnvCache() {
  cached = undefined
}
