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
