import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { openDb, type Db } from "@/lib/db"
import { resetEnvCache } from "@/lib/env"

export type TestEnv = {
  dataDir: string
  db: Db
  cleanup: () => void
}

export function createTestEnv(overrides: Record<string, string> = {}): TestEnv {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "nimbus-test-"))
  const previous = { ...process.env }
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    DATABASE_PATH: path.join(dataDir, "app.db"),
    TRANSCRIBER: "fake",
    HIGHLIGHT_SELECTOR: "heuristic",
    ...overrides,
  })
  resetEnvCache()
  const db = openDb(path.join(dataDir, "app.db"))
  const globalForDb = globalThis as unknown as { __autoClipperDb?: Db }
  globalForDb.__autoClipperDb = db
  return {
    dataDir,
    db,
    cleanup() {
      db.$client.close()
      globalForDb.__autoClipperDb = undefined
      process.env = previous
      resetEnvCache()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
