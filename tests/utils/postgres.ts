import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"

import { MIGRATIONS_DIR, schema, type Db } from "@/lib/db"

export const POSTGRES_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://nimbus:nimbus@localhost:5442/nimbus"

function withDatabase(url: string, name: string) {
  const next = new URL(url)
  next.pathname = `/${name}`
  return next.toString()
}

export async function postgresReachable(url = POSTGRES_URL) {
  const client = new Client({ connectionString: url })
  try {
    await client.connect()
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function recreateDatabase(name: string, url = POSTGRES_URL) {
  const admin = new Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`drop database if exists "${name}" with (force)`)
    await admin.query(`create database "${name}"`)
  } finally {
    await admin.end()
  }
  const target = withDatabase(url, name)
  const pool = new Pool({ connectionString: target, max: 1 })
  await migrate(drizzle(pool, { schema }), { migrationsFolder: MIGRATIONS_DIR })
  await pool.end()
  return target
}

export async function dropDatabase(name: string, url = POSTGRES_URL) {
  const admin = new Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`drop database if exists "${name}" with (force)`)
  } finally {
    await admin.end()
  }
}

export function connect(url: string) {
  const pool = new Pool({ connectionString: url, max: 4 })
  return { pool, db: drizzle(pool, { schema }) as unknown as Db }
}
