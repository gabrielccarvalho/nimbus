export const LIST_UNITS = 1
export const UPLOAD_UNITS = 1

const QUOTA_TIME_ZONE = "America/Los_Angeles"

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: QUOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
})

function pacificParts(at: Date) {
  const parts: Record<string, number> = {}
  for (const p of formatter.formatToParts(at)) parts[p.type] = Number(p.value)
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
  }
}

export function pacificDay(at: Date): string {
  const { year, month, day } = pacificParts(at)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function nextQuotaReset(at: Date): Date {
  const { year, month, day } = pacificParts(at)
  // Pacific midnight is 07:00 UTC during DST and 08:00 UTC otherwise.
  for (const utcHour of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day + 1, utcHour))
    if (pacificParts(candidate).hour === 0) return candidate
  }
  return new Date(Date.UTC(year, month - 1, day + 1, 8))
}
