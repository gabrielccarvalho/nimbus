import { createDecipheriv, pbkdf2Sync } from "node:crypto"

export const CHROMIUM_BROWSERS = {
  dia: {
    label: "Dia",
    userDataDir: "Library/Application Support/Dia/User Data",
    keychainService: "Dia Safe Storage",
  },
} as const

export type ChromiumBrowser = keyof typeof CHROMIUM_BROWSERS

export type BrowserSpec = { browser: ChromiumBrowser; profile: string }

export type NetscapeCookie = {
  host: string
  name: string
  value: string
  path: string
  expires: number
  secure: boolean
}

const UNIX_EPOCH_IN_CHROMIUM_SECONDS = 11_644_473_600
const HOST_HASH_BYTES = 32

// Browsers yt-dlp's --cookies-from-browser can't decrypt; anything else is passed through to it.
export function parseBrowserSpec(spec: string): BrowserSpec | null {
  const [name = "", ...rest] = spec.split(":")
  const browser = name.trim().toLowerCase()
  if (!Object.hasOwn(CHROMIUM_BROWSERS, browser)) return null
  return {
    browser: browser as ChromiumBrowser,
    profile: rest.join(":").trim() || "Default",
  }
}

export function deriveCookieKey(password: string): Buffer {
  return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1")
}

export function decryptCookieValue(
  encrypted: Buffer,
  key: Buffer,
  schemaVersion: number
): string | null {
  if (encrypted.subarray(0, 3).toString() !== "v10") return null
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "))
    const plain = Buffer.concat([
      decipher.update(encrypted.subarray(3)),
      decipher.final(),
    ])
    return (
      schemaVersion >= 24 ? plain.subarray(HOST_HASH_BYTES) : plain
    ).toString("utf8")
  } catch {
    return null
  }
}

export function chromiumTimeToUnix(microseconds: number): number {
  if (microseconds <= 0) return 0
  return Math.floor(microseconds / 1_000_000) - UNIX_EPOCH_IN_CHROMIUM_SECONDS
}

export function toNetscapeCookies(cookies: readonly NetscapeCookie[]): string {
  const lines = cookies.map((c) =>
    [
      c.host,
      c.host.startsWith(".") ? "TRUE" : "FALSE",
      c.path,
      c.secure ? "TRUE" : "FALSE",
      String(c.expires),
      c.name,
      c.value,
    ].join("\t")
  )
  return ["# Netscape HTTP Cookie File", ...lines, ""].join("\n")
}
