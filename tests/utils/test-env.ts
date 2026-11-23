import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { getTableName, isTable, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

import { MIGRATIONS_DIR, schema, setDb, type Db } from "@/lib/db"
import { resetEnvCache } from "@/lib/env"

export type TestEnv = {
  dataDir: string
  db: Db
  cleanup: () => void
}

let shared: Promise<Db> | undefined

export function testDb(): Promise<Db> {
  shared ??= (async () => {
    const db = drizzle(new PGlite(), { schema })
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    return db as unknown as Db
  })()
  return shared
}

const tableNames = Object.values(schema)
  .filter(isTable)
  .map((table) => `"${getTableName(table)}"`)
  .join(", ")

export async function createTestEnv(
  overrides: Record<string, string> = {}
): Promise<TestEnv> {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "nimbus-test-"))
  const previous = { ...process.env }
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    TRANSCRIBER: "fake",
    HIGHLIGHT_SELECTOR: "heuristic",
    ...overrides,
  })
  resetEnvCache()
  const db = await testDb()
  await db.execute(sql.raw(`truncate ${tableNames} cascade`))
  setDb(db)
  return {
    dataDir,
    db,
    cleanup() {
      setDb(undefined)
      process.env = previous
      resetEnvCache()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
