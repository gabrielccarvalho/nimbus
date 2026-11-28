import "server-only"

import os from "node:os"
import path from "node:path"
import { z } from "zod"

const booleanish = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1")

const envFields = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATA_DIR: z.string().min(1).default("./data"),
  SCRATCH_DIR: z.string().min(1).default(path.join(os.tmpdir(), "nimbus")),
  SCRATCH_CACHE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(64 * 1024 ** 3),
  STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: booleanish,
  NIMBUS_ROLE: z.enum(["web", "worker", "all"]).default("all"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://nimbus:nimbus@localhost:5442/nimbus"),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  VIDEO_ENCODER: z
    .enum(["auto", "libx264", "h264_videotoolbox", "h264_nvenc", "h264_qsv"])
    .default("libx264"),
  WHISPER_LANGUAGE: z.string().min(1).default("auto"),
  TRANSCRIBER: z.enum(["groq", "fake"]).default("groq"),
  YTDLP_PATH: z.string().min(1).default("yt-dlp"),
  YTDLP_COOKIES_FROM_BROWSER: z.string().min(1).optional(),
  YTDLP_COOKIES: z.string().min(1).optional(),
  YTDLP_COOKIES_TEXT: z.string().min(1).optional(),
  DOWNLOADER: z.enum(["yt-dlp", "fake"]).default("yt-dlp"),
  FAKE_DOWNLOAD_FILE: z.string().min(1).optional(),
  HIGHLIGHT_SELECTOR: z
    .enum(["anthropic", "manual", "heuristic"])
    .default("heuristic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  ANTHROPIC_REVIEW_MODEL: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.url().optional(),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 ** 3),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_RENDER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_SHUTDOWN_GRACE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(25_000),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65_535).default(8787),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .optional(),
  E2E: booleanish,
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  VERCEL_URL: z.string().min(1).optional(),
  VERCEL_BRANCH_URL: z.string().min(1).optional(),
  NIMBUS_SECRET_KEY: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  YOUTUBE_CLIENT: z.enum(["http", "fake"]).default("http"),
  YOUTUBE_DAILY_QUOTA: z.coerce.number().int().positive().default(10_000),
  YOUTUBE_DAILY_UPLOADS: z.coerce.number().int().positive().default(100),
  TWITCH_CLIENT_ID: z.string().min(1).optional(),
  TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
  BILLING_CLIENT: z.enum(["abacatepay", "fake"]).default("abacatepay"),
  ABACATEPAY_API_KEY: z.string().min(1).optional(),
  ABACATEPAY_CREATOR_PRODUCT_ID: z.string().min(1).optional(),
  ABACATEPAY_WEBHOOK_SECRET: z.string().min(32).optional(),
})

const S3_REQUIRED = [
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const

const envSchema = envFields.superRefine((env, ctx) => {
  if (env.STORAGE_BACKEND !== "s3") return
  for (const name of S3_REQUIRED) {
    if (!env[name]) {
      ctx.addIssue({
        code: "custom",
        path: [name],
        message: `${name} is required when STORAGE_BACKEND=s3`,
      })
    }
  }
  if (!env.S3_ENDPOINT && env.S3_REGION === "auto") {
    ctx.addIssue({
      code: "custom",
      path: ["S3_REGION"],
      message:
        "S3_REGION is required when STORAGE_BACKEND=s3 has no S3_ENDPOINT (AWS needs a real region, e.g. us-east-1)",
    })
  }
})

type RawEnv = z.infer<typeof envSchema>

export type Env = Omit<RawEnv, "BETTER_AUTH_SECRET" | "NIMBUS_SECRET_KEY"> & {
  BETTER_AUTH_SECRET: string
  NIMBUS_SECRET_KEY: string
}

const DEV_SECRET = "nimbus-development-secret-do-not-use-in-production"

function secret(name: string, value: string | undefined, nodeEnv: string) {
  if (value) return value
  if (nodeEnv === "production") {
    throw new Error(`${name} is required in production (32+ characters)`)
  }
  return `${DEV_SECRET}:${name}`
}

let cached: Env | undefined

export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== "")
  )
  const raw = envSchema.parse(cleaned)
  return {
    ...raw,
    DATA_DIR: path.resolve(/* turbopackIgnore: true */ raw.DATA_DIR),
    SCRATCH_DIR: path.resolve(/* turbopackIgnore: true */ raw.SCRATCH_DIR),
    BETTER_AUTH_SECRET: secret(
      "BETTER_AUTH_SECRET",
      raw.BETTER_AUTH_SECRET,
      raw.NODE_ENV
    ),
    NIMBUS_SECRET_KEY: secret(
      "NIMBUS_SECRET_KEY",
      raw.NIMBUS_SECRET_KEY,
      raw.NODE_ENV
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
