import "server-only"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { runProcess } from "@/lib/process/run"

import { createProgressParser } from "./progress-parser"

export type FfmpegRunOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  expectedDurationMs?: number
  onProgress?: (percent: number) => void
  onStderrLine?: (line: string) => void
}

export async function runFfmpeg(
  args: readonly string[],
  options: FfmpegRunOptions = {}
) {
  const env = getEnv()
  const parse = createProgressParser(options.expectedDurationMs ?? 0)
  const withProgress = Boolean(options.onProgress)
  const result = await runProcess(
    env.FFMPEG_PATH,
    [
      "-hide_banner",
      "-nostdin",
      "-y",
      ...(withProgress ? ["-progress", "pipe:1", "-nostats"] : []),
      ...args,
    ],
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      collectStdout: !withProgress,
      onStderrLine: options.onStderrLine,
      onStdoutLine: withProgress
        ? (line) => {
            const progress = parse(line)
            if (progress) options.onProgress?.(progress.percent)
          }
        : undefined,
    }
  )
  if (result.code !== 0) {
    throw new AppError("EXTERNAL", `ffmpeg exited with code ${result.code}`, {
      details: { stderrTail: result.stderrTail },
    })
  }
  return result
}

export async function runFfprobe(
  file: string,
  signal?: AbortSignal,
  kind: "video" | "audio" = "video"
) {
  const env = getEnv()
  const result = await runProcess(
    env.FFPROBE_PATH,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ],
    { signal, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      kind === "audio"
        ? "This file couldn't be read as audio"
        : "This file couldn't be read as a video",
      { details: { stderrTail: result.stderrTail } }
    )
  }
  return result.stdout
}
