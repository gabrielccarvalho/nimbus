import "server-only"

import { readdir } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"
import { runProcess, type RunOptions } from "@/lib/process/run"

import type { ExportedCookies } from "./browser-cookies"
import type { DownloadInput, Downloader, VideoInfo } from "./downloader"
import {
  describeYtDlpError,
  parseInfo,
  PROGRESS_TEMPLATE,
  downloadProgress,
} from "./yt-dlp-parse"

const FORMAT = [
  "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]",
  "bv*[height<=1080]+ba",
  "b[height<=1080]",
  "b",
].join("/")

const INFO_TIMEOUT_MS = 60_000

// Signed-in requests can get no playable formats from YouTube while anonymous ones do.
const NO_FORMATS = /Requested format is not available/i

export class YtDlpDownloader implements Downloader {
  readonly id = "yt-dlp"

  constructor(
    private readonly options: {
      binary: string
      ffmpeg: string
      cookiesFromBrowser?: string
      cookiesFile?: string
      exportCookies?: () => Promise<ExportedCookies>
    }
  ) {}

  private hasCookies() {
    return Boolean(
      this.options.cookiesFromBrowser ||
      this.options.cookiesFile ||
      this.options.exportCookies
    )
  }

  private async run(args: string[], options: RunOptions) {
    const exported = await this.options.exportCookies?.()
    let result
    try {
      result = await runProcess(
        this.options.binary,
        [...this.baseArgs(exported?.file ?? this.options.cookiesFile), ...args],
        options
      )
    } finally {
      await exported?.cleanup()
    }
    if (
      result.code !== 0 &&
      this.hasCookies() &&
      NO_FORMATS.test(result.stderrTail)
    ) {
      return runProcess(
        this.options.binary,
        [...this.baseArgs(undefined, { anonymous: true }), ...args],
        options
      )
    }
    return result
  }

  private baseArgs(
    cookiesFile: string | undefined,
    { anonymous = false }: { anonymous?: boolean } = {}
  ) {
    const args = ["--no-playlist", "--no-warnings", "--ignore-config"]
    if (this.options.ffmpeg.includes("/")) {
      args.push("--ffmpeg-location", this.options.ffmpeg)
    }
    if (anonymous) return args
    if (this.options.cookiesFromBrowser) {
      args.push("--cookies-from-browser", this.options.cookiesFromBrowser)
    }
    if (cookiesFile) {
      args.push("--cookies", cookiesFile)
    }
    return args
  }

  private describeError(stderr: string) {
    return describeYtDlpError(stderr, { withCookies: this.hasCookies() })
  }

  async info(url: string, signal?: AbortSignal): Promise<VideoInfo> {
    const result = await this.run(
      ["--flat-playlist", "--dump-single-json", "--skip-download", url],
      { signal, timeoutMs: INFO_TIMEOUT_MS, stderrTailBytes: 8192 }
    )
    if (result.code !== 0) throw this.describeError(result.stderrTail)
    return parseInfo(result.stdout)
  }

  async download({
    url,
    dir,
    maxBytes,
    signal,
    onProgress,
  }: DownloadInput): Promise<string> {
    const onLine = onProgress ? downloadProgress(onProgress) : undefined
    const result = await this.run(
      [
        "--format",
        FORMAT,
        "--merge-output-format",
        "mp4/mkv",
        "--max-filesize",
        String(maxBytes),
        "--newline",
        "--progress-template",
        PROGRESS_TEMPLATE,
        "--paths",
        dir,
        "--output",
        "source.%(ext)s",
        url,
      ],
      {
        signal,
        collectStdout: false,
        stderrTailBytes: 8192,
        onStdoutLine: onLine,
      }
    )
    if (result.code !== 0) throw this.describeError(result.stderrTail)
    const file = (await readdir(dir)).find((name) =>
      /^source\.(mp4|mkv|webm|mov)$/.test(name)
    )
    if (!file) {
      throw new AppError(
        "UNSUPPORTED_MEDIA",
        "The downloaded video isn't in a supported format"
      )
    }
    return path.join(dir, file)
  }
}
