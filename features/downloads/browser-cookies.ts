import "server-only"

import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import { AppError } from "@/lib/errors"
import { runProcess } from "@/lib/process/run"

import {
  CHROMIUM_BROWSERS,
  chromiumTimeToUnix,
  decryptCookieValue,
  deriveCookieKey,
  toNetscapeCookies,
  type BrowserSpec,
  type NetscapeCookie,
} from "./chromium-cookies"

export type ExportedCookies = { file: string; cleanup: () => Promise<void> }

type CookieRow = {
  host_key: string
  name: string
  value: string
  encrypted: string
  path: string
  expires_utc: number
  is_secure: number
  schema: string
}

const QUERY = `select host_key, name, value, hex(encrypted_value) as encrypted, path, expires_utc, is_secure,
  (select value from meta where key = 'version') as schema
  from cookies
  where host_key like '%youtube.com' or host_key like '%google.com'`

// The first read pops a macOS Keychain prompt; "Always Allow" keeps later reads silent.
const KEYCHAIN_TIMEOUT_MS = 120_000

const keys = new Map<string, Buffer>()

export function cookieDatabasePath({ browser, profile }: BrowserSpec) {
  return path.join(
    homedir(),
    CHROMIUM_BROWSERS[browser].userDataDir,
    profile,
    "Cookies"
  )
}

async function cookieKey(browser: BrowserSpec["browser"]) {
  const service = CHROMIUM_BROWSERS[browser].keychainService
  const cached = keys.get(service)
  if (cached) return cached
  const result = await runProcess(
    "security",
    ["find-generic-password", "-w", "-s", service],
    { timeoutMs: KEYCHAIN_TIMEOUT_MS }
  )
  if (result.code !== 0) {
    throw new AppError(
      "DEPENDENCY_MISSING",
      `Couldn't unlock ${CHROMIUM_BROWSERS[browser].label}'s cookies. Click "Always Allow" on the Keychain prompt and try again.`
    )
  }
  const key = deriveCookieKey(result.stdout.trim())
  keys.set(service, key)
  return key
}

async function readCookies(spec: BrowserSpec, dir: string) {
  const copy = path.join(dir, "Cookies")
  try {
    await copyFile(cookieDatabasePath(spec), copy)
  } catch {
    throw new AppError(
      "DEPENDENCY_MISSING",
      `No ${CHROMIUM_BROWSERS[spec.browser].label} cookies found for profile "${spec.profile}"`
    )
  }
  const result = await runProcess("sqlite3", [
    "-readonly",
    "-json",
    copy,
    QUERY,
  ])
  if (result.code !== 0) {
    throw new AppError(
      "EXTERNAL",
      `Couldn't read ${CHROMIUM_BROWSERS[spec.browser].label}'s cookies`
    )
  }
  return (result.stdout.trim() ? JSON.parse(result.stdout) : []) as CookieRow[]
}

function decryptRows(rows: CookieRow[], key: Buffer): NetscapeCookie[] {
  return rows.flatMap((row) => {
    const value = row.encrypted
      ? decryptCookieValue(
          Buffer.from(row.encrypted, "hex"),
          key,
          Number(row.schema)
        )
      : row.value
    if (value === null) return []
    return [
      {
        host: row.host_key,
        name: row.name,
        value,
        path: row.path,
        expires: chromiumTimeToUnix(row.expires_utc),
        secure: row.is_secure === 1,
      },
    ]
  })
}

export async function exportBrowserCookies(
  spec: BrowserSpec
): Promise<ExportedCookies> {
  const dir = await mkdtemp(path.join(tmpdir(), "nimbus-cookies-"))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const rows = await readCookies(spec, dir)
    let cookies = decryptRows(rows, await cookieKey(spec.browser))
    if (rows.length > 0 && cookies.length === 0) {
      keys.delete(CHROMIUM_BROWSERS[spec.browser].keychainService)
      cookies = decryptRows(rows, await cookieKey(spec.browser))
    }
    const file = path.join(dir, "cookies.txt")
    await writeFile(file, toNetscapeCookies(cookies), { mode: 0o600 })
    await rm(path.join(dir, "Cookies"), { force: true })
    return { file, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
