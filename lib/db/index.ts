import "server-only"

import { mkdirSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"

import { getEnv } from "@/lib/env"

import * as schema from "./schema"

export type Db = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database
}

export const MIGRATIONS_DIR = path.join(process.cwd(), "lib/db/migrations")

export function openDb(file: string, { runMigrations = true } = {}): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })
  const client = new Database(file)
  client.pragma("journal_mode = WAL")
  client.pragma("foreign_keys = ON")
  client.pragma("busy_timeout = 5000")
  client.pragma("synchronous = NORMAL")
  const db = drizzle(client, { schema })
  if (runMigrations) migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return db
}

const globalForDb = globalThis as unknown as { __autoClipperDb?: Db }

export function getDb(): Db {
  globalForDb.__autoClipperDb ??= openDb(getEnv().DATABASE_PATH)
  return globalForDb.__autoClipperDb
}

export function withTransaction<T>(db: Db, fn: () => T): T {
  return db.$client.transaction(fn)()
}

export function now() {
  return new Date()
}

export function newId() {
  return crypto.randomUUID()
}

export { schema }
