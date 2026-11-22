import "server-only"

import pino from "pino"

function defaultLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return "silent"
  return "info"
}

const pretty =
  process.env.NODE_ENV !== "production" &&
  !process.env.VITEST &&
  process.stdout.isTTY

export const logger = pino({
  level: defaultLevel(),
  base: undefined,
  redact: {
    paths: ["*.apiKey", "*.ANTHROPIC_API_KEY", "headers.authorization"],
    remove: true,
  },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
})

export type Logger = typeof logger
