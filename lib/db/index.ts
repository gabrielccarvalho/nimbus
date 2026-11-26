import "server-only"

import path from "node:path"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { Pool } from "pg"

import { getEnv } from "@/lib/env"

import * as schema from "./schema"

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const MIGRATIONS_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "lib/db/migrations"
)

const globalForDb = globalThis as unknown as {
  __nimbusDb?: Db
  __nimbusPool?: Pool
}

export function getDb(): Db {
  if (!globalForDb.__nimbusDb) {
    const env = getEnv()
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
    })
    globalForDb.__nimbusPool = pool
    globalForDb.__nimbusDb = drizzle(pool, { schema })
  }
  return globalForDb.__nimbusDb
}

export function setDb(db: Db | undefined) {
  globalForDb.__nimbusDb = db
}

export async function migrateDb() {
  getDb()
  await migrate(drizzle(globalForDb.__nimbusPool!, { schema }), {
    migrationsFolder: MIGRATIONS_DIR,
  })
}

export async function closeDb() {
  await globalForDb.__nimbusPool?.end()
  globalForDb.__nimbusPool = undefined
  globalForDb.__nimbusDb = undefined
}

export function withTransaction<T>(
  db: Db,
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  return db.transaction((tx) => fn(tx))
}

export function now() {
  return new Date()
}

export function newId() {
  return crypto.randomUUID()
}

export { schema }
