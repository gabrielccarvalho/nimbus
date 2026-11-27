export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "—"
  }
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`
}

export function formatTimestamp(ms: number): string {
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100)
  return `${formatDuration(ms)}.${tenths}`
}

// "1:02:03.5", "2:03" or plain seconds.
export function parseTimestamp(text: string): number | null {
  const fields = text.trim().split(":")
  if (fields.length === 0 || fields.length > 3) return null
  if (fields.some((field) => !/^\d+(\.\d+)?$/.test(field))) return null
  const seconds = fields.reduce((sum, field) => sum * 60 + Number(field), 0)
  return Math.round(seconds * 1000)
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"]

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "—"
  }
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}

export function formatDate(date: Date | number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function mediaUrl(key: string, options: { download?: string } = {}) {
  const path = key.split("/").map(encodeURIComponent).join("/")
  const query = options.download
    ? `?download=${encodeURIComponent(options.download)}`
    : ""
  return `/api/media/${path}${query}`
}

export function slugify(text: string, fallback = "clip") {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")
  return slug || fallback
}

const DAY_MS = 86_400_000

export function formatRelativeDay(date: Date | number, now = new Date()) {
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(new Date(date))) / DAY_MS)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      new Date(date).getFullYear() === now.getFullYear()
        ? undefined
        : "numeric",
  }).format(date)
}

export function sourceLabel(url: string | null | undefined) {
  if (!url) return "Upload"
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, "")
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube"
    if (host.endsWith("twitch.tv")) return "Twitch VOD"
    return host
  } catch {
    return "Link"
  }
}
