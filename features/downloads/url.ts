import { AppError } from "@/lib/errors"

const MAX_URL_LENGTH = 2048

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true
  if (host.endsWith(".internal")) return true
  const octets = host.split(".").map(Number)
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o))) {
    return false
  }
  const [a, b] = octets as [number, number, number, number]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export function parseVideoUrl(input: unknown): string {
  const invalid = new AppError("VALIDATION", "Paste a link to a video")
  if (typeof input !== "string") throw invalid
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) throw invalid
  let url: URL
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
    )
  } catch {
    throw invalid
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid
  if (!url.hostname.includes(".") || isPrivateHost(url.hostname)) {
    throw invalid
  }
  url.hash = ""
  return url.toString()
}

export function isPublicUrl(input: string) {
  try {
    parseVideoUrl(input)
    return true
  } catch {
    return false
  }
}

export function placeholderName(url: string) {
  const { hostname, pathname, searchParams } = new URL(url)
  const site = hostname.replace(/^(www|m)\./, "")
  const id = searchParams.get("v") ?? pathname.split("/").filter(Boolean).pop()
  return id ? `${site} ${id}` : site
}
