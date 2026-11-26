import "server-only"

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

let written: { file: string; text: string } | undefined

export function materializeCookiesText(scratchDir: string, text: string) {
  const file = path.join(scratchDir, "ytdlp-cookies.txt")
  if (written?.file === file && written.text === text && existsSync(file)) {
    return file
  }
  mkdirSync(scratchDir, { recursive: true })
  writeFileSync(file, text, { mode: 0o600 })
  chmodSync(file, 0o600)
  written = { file, text }
  return file
}
