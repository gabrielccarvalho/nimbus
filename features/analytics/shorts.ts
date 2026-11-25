import type { ChannelContentType, VideoDetails } from "./schema"

export const SHORT_MAX_MS = 180_000

const ISO_DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

export function parseIsoDuration(value: string): number | null {
  const match = ISO_DURATION.exec(value)
  if (!match || value === "P" || value.endsWith("T")) return null
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match
  return Math.round(
    (Number(days) * 86_400 +
      Number(hours) * 3_600 +
      Number(minutes) * 60 +
      Number(seconds)) *
      1000
  )
}

export function contentTypeOf(raw: string): ChannelContentType {
  if (raw === "SHORTS") return "shorts"
  if (raw === "VIDEO_ON_DEMAND") return "long"
  return "other"
}

export function isShort(video: {
  durationMs: number | null
  contentType: string | null
}): boolean {
  if (video.contentType !== null) return video.contentType === "SHORTS"
  return (
    video.durationMs !== null &&
    video.durationMs > 0 &&
    video.durationMs <= SHORT_MAX_MS
  )
}

export function importableShort(
  video: VideoDetails,
  contentType: string | null
): boolean {
  return (
    video.uploadStatus === "processed" &&
    (video.privacy === "public" || video.privacy === "unlisted") &&
    isShort({ durationMs: video.durationMs, contentType })
  )
}
