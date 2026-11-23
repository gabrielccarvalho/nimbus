import "@/lib/load-env"

import path from "node:path"

import Database from "better-sqlite3"
import { getTableColumns } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"

import { closeDb, getDb, migrateDb, schema } from "@/lib/db"
import { getEnv } from "@/lib/env"

const TABLES: Array<[string, PgTable]> = [
  ["projects", schema.projects],
  ["assets", schema.assets],
  ["transcripts", schema.transcripts],
  ["signals", schema.signals],
  ["layouts", schema.layouts],
  ["layout_presets", schema.layoutPresets],
  ["clips", schema.clips],
  ["jobs", schema.jobs],
  ["settings", schema.settings],
]

function convert(table: PgTable, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    const value = row[column.name]
    if (value === null || value === undefined) {
      out[key] = value
    } else if (column.columnType === "PgTimestamp") {
      out[key] = new Date(Number(value))
    } else if (column.columnType === "PgJsonb") {
      out[key] = JSON.parse(String(value))
    } else if (column.columnType === "PgBoolean") {
      out[key] = Boolean(value)
    } else {
      out[key] = value
    }
  }
  return out
}

const file = path.resolve(
  process.argv[2] ?? path.join(getEnv().DATA_DIR, "app.db")
)
const sqlite = new Database(file, { readonly: true, fileMustExist: true })
await migrateDb()
const db = getDb()
for (const [name, table] of TABLES) {
  const rows = sqlite.prepare(`select * from ${name}`).all() as Array<
    Record<string, unknown>
  >
  for (const row of rows) {
    await db.insert(table).values(convert(table, row)).onConflictDoNothing()
  }
  console.log(`${name}: ${rows.length}`)
}
sqlite.close()
await closeDb()
