import type { DownloadProgress } from "./downloader"
import { AppError } from "@/lib/errors"

import type { VideoInfo } from "./downloader"

export const PROGRESS_PREFIX = "progress"
export const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`

export function parseInfo(json: string): VideoInfo {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json) as Record<string, unknown>
  } catch {
    throw new AppError("EXTERNAL", "yt-dlp returned unreadable video details")
  }
  if (raw._type === "playlist") {
    throw new AppError(
      "VALIDATION",
      "This is a playlist or channel link. Paste a link to a single video."
    )
  }
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null
  const duration = number(raw.duration)
  return {
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    language: typeof raw.language === "string" ? raw.language : null,
    durationMs: duration === null ? null : Math.round(duration * 1000),
    isLive:
      raw.is_live === true ||
      raw.live_status === "is_live" ||
      raw.live_status === "is_upcoming" ||
      raw.live_status === "post_live",
    approxBytes: number(raw.filesize_approx) ?? number(raw.filesize),
    thumbnailUrl:
      typeof raw.thumbnail === "string" && raw.thumbnail.startsWith("https://")
        ? raw.thumbnail
        : null,
  }
}

const positive = (value: string | undefined) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function parseProgressLine(line: string) {
  const parts = line.trim().split(/\s+/)
  if (parts[0] !== PROGRESS_PREFIX) return null
  const downloaded = Number(parts[1])
  const total = positive(parts[2]) ?? positive(parts[3])
  if (!Number.isFinite(downloaded) || !total) return null
  return {
    percent: Math.min(100, Math.max(0, (downloaded / total) * 100)),
    downloadedBytes: downloaded,
    totalBytes: total,
    bytesPerSecond: positive(parts[4]),
    etaSeconds: positive(parts[5]),
  }
}

const VIDEO_SHARE = 90

export function downloadProgress(
  onProgress: (progress: DownloadProgress) => void
) {
  let streams = 0
  let finishedBytes = 0
  let current = 0
  return (line: string) => {
    if (line.startsWith("[download] Destination:")) {
      streams++
      finishedBytes += current
      current = 0
      return
    }
    const parsed = parseProgressLine(line)
    if (parsed === null) return
    current = parsed.downloadedBytes
    onProgress({
      ...parsed,
      percent:
        streams <= 1
          ? (parsed.percent * VIDEO_SHARE) / 100
          : VIDEO_SHARE + (parsed.percent * (100 - VIDEO_SHARE)) / 100,
      downloadedBytes: finishedBytes + parsed.downloadedBytes,
      totalBytes: finishedBytes + parsed.totalBytes,
    })
  }
}

const KNOWN_ERRORS: [RegExp, AppError["code"], string][] = [
  [/private video/i, "VALIDATION", "This video is private"],
  [
    /members.only|join this channel/i,
    "VALIDATION",
    "This video is for channel members only",
  ],
  [
    /confirm your age|age.restricted|inappropriate for some users/i,
    "VALIDATION",
    "This video is age-restricted and can't be downloaded without signing in",
  ],
  [
    /not a bot|HTTP Error 429|too many requests/i,
    "EXTERNAL",
    "The site is rate limiting downloads. Try again in a few minutes.",
  ],
  [
    /larger than max-filesize|File is larger than/i,
    "TOO_LARGE",
    "This video is larger than the upload limit",
  ],
  [
    /unsupported url|is not a valid url/i,
    "VALIDATION",
    "This link isn't a video page yt-dlp can download",
  ],
  [
    /video unavailable|video is unavailable|has been removed|does not exist|HTTP Error 404/i,
    "NOT_FOUND",
    "This video is unavailable or was removed",
  ],
  [
    /live event will begin|premieres in/i,
    "VALIDATION",
    "This video hasn't premiered yet",
  ],
  [
    /unable to download webpage|getaddrinfo|timed out|connection (reset|refused)/i,
    "EXTERNAL",
    "Couldn't reach the site. Check your connection and try again.",
  ],
]

export function describeYtDlpError(stderr: string): AppError {
  for (const [pattern, code, message] of KNOWN_ERRORS) {
    if (pattern.test(stderr)) return new AppError(code, message)
  }
  const lastError = stderr
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith("ERROR:"))
  return new AppError(
    "EXTERNAL",
    lastError
      ? `Download failed: ${lastError.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]{6,}:\s+)?/, "").slice(0, 200)}`
      : "Download failed"
  )
}
