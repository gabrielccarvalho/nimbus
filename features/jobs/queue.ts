import "server-only"

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  lte,
  notInArray,
  sql,
} from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import { jobs } from "@/lib/db/schema"

import type { JobType } from "./schema"

export type Job = typeof jobs.$inferSelect

const BACKOFF_BASE_MS = 2_000
const BACKOFF_MAX_MS = 5 * 60_000

export function backoffMs(attempts: number) {
  return Math.min(
    BACKOFF_MAX_MS,
    BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1)
  )
}

export type EnqueueInput = {
  type: JobType
  projectId: string | null
  payload?: Record<string, unknown>
  maxAttempts?: number
  runAfter?: Date
}

export type LeaseInput = {
  owner: string
  leaseMs: number
  types?: readonly JobType[]
  excludeTypes?: readonly JobType[]
}

export function jobQueue(db: Db) {
  const changed = (rows: unknown[]) => rows.length > 0

  return {
    async enqueue(input: EnqueueInput): Promise<Job> {
      const [row] = await db
        .insert(jobs)
        .values({
          id: newId(),
          type: input.type,
          projectId: input.projectId,
          payload: input.payload ?? {},
          maxAttempts: input.maxAttempts ?? 3,
          runAfter: input.runAfter ?? now(),
        })
        .returning()
      return row!
    },

    lease({
      owner,
      leaseMs,
      types,
      excludeTypes,
    }: LeaseInput): Promise<Job | undefined> {
      return withTransaction(db, async (tx) => {
        const at = now()
        const filters = [eq(jobs.status, "queued"), lte(jobs.runAfter, at)]
        if (types?.length) filters.push(inArray(jobs.type, [...types]))
        if (excludeTypes?.length) {
          filters.push(notInArray(jobs.type, [...excludeTypes]))
        }
        const [next] = await tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(...filters))
          .orderBy(asc(jobs.runAfter), asc(jobs.createdAt))
          .limit(1)
          .for("update", { skipLocked: true })
        if (!next) return undefined
        const [row] = await tx
          .update(jobs)
          .set({
            status: "running",
            leaseOwner: owner,
            leasedUntil: new Date(at.getTime() + leaseMs),
            attempts: sql`${jobs.attempts} + 1`,
            detail: null,
            startedAt: sql`coalesce(${jobs.startedAt}, ${at.toISOString()}::timestamptz)`,
            updatedAt: at,
          })
          .where(eq(jobs.id, next.id))
          .returning()
        return row
      })
    },

    async heartbeat(
      id: string,
      owner: string,
      leaseMs: number,
      progress?: number,
      detail?: Record<string, unknown>
    ): Promise<boolean> {
      const at = now()
      return changed(
        await db
          .update(jobs)
          .set({
            leasedUntil: new Date(at.getTime() + leaseMs),
            updatedAt: at,
            ...(progress === undefined
              ? {}
              : { progress: Math.max(0, Math.min(100, progress)) }),
            ...(detail === undefined ? {} : { detail }),
          })
          .where(
            and(
              eq(jobs.id, id),
              eq(jobs.leaseOwner, owner),
              eq(jobs.status, "running")
            )
          )
          .returning({ id: jobs.id })
      )
    },

    async complete(id: string, owner: string): Promise<boolean> {
      const at = now()
      return changed(
        await db
          .update(jobs)
          .set({
            status: "succeeded",
            progress: 100,
            leasedUntil: null,
            finishedAt: at,
            updatedAt: at,
            error: null,
          })
          .where(
            and(
              eq(jobs.id, id),
              eq(jobs.leaseOwner, owner),
              eq(jobs.status, "running")
            )
          )
          .returning({ id: jobs.id })
      )
    },

    fail(
      id: string,
      owner: string,
      message: string,
      { retryable }: { retryable: boolean }
    ): Promise<Job | undefined> {
      return withTransaction(db, async (tx) => {
        const [current] = await tx
          .select()
          .from(jobs)
          .where(eq(jobs.id, id))
          .for("update")
        if (
          !current ||
          current.leaseOwner !== owner ||
          current.status !== "running"
        ) {
          return current
        }
        const at = now()
        const retry = retryable && current.attempts < current.maxAttempts
        const [row] = await tx
          .update(jobs)
          .set(
            retry
              ? {
                  status: "queued",
                  leaseOwner: null,
                  leasedUntil: null,
                  runAfter: new Date(
                    at.getTime() + backoffMs(current.attempts)
                  ),
                  error: message,
                  updatedAt: at,
                }
              : {
                  status: "failed",
                  leasedUntil: null,
                  error: message,
                  finishedAt: at,
                  updatedAt: at,
                }
          )
          .where(eq(jobs.id, id))
          .returning()
        return row
      })
    },

    async cancel(id: string): Promise<boolean> {
      const at = now()
      return changed(
        await db
          .update(jobs)
          .set({ status: "cancelled", finishedAt: at, updatedAt: at })
          .where(
            and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"]))
          )
          .returning({ id: jobs.id })
      )
    },

    async cancelForProject(
      projectId: string,
      types?: readonly JobType[]
    ): Promise<number> {
      const at = now()
      const filters = [
        eq(jobs.projectId, projectId),
        inArray(jobs.status, ["queued", "running"]),
      ]
      if (types?.length) filters.push(inArray(jobs.type, [...types]))
      const rows = await db
        .update(jobs)
        .set({ status: "cancelled", finishedAt: at, updatedAt: at })
        .where(and(...filters))
        .returning({ id: jobs.id })
      return rows.length
    },

    async recoverExpired(): Promise<number> {
      const at = now()
      const expired = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "running"), lt(jobs.leasedUntil, at)))
      for (const job of expired) {
        const exhausted = job.attempts >= job.maxAttempts
        await db
          .update(jobs)
          .set(
            exhausted
              ? {
                  status: "failed",
                  error: "Worker stopped while running this job",
                  leasedUntil: null,
                  finishedAt: at,
                  updatedAt: at,
                }
              : {
                  status: "queued",
                  leaseOwner: null,
                  leasedUntil: null,
                  runAfter: at,
                  updatedAt: at,
                }
          )
          .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")))
      }
      return expired.length
    },

    async get(id: string): Promise<Job | undefined> {
      const [row] = await db.select().from(jobs).where(eq(jobs.id, id))
      return row
    },

    listForProject(projectId: string): Promise<Job[]> {
      return db
        .select()
        .from(jobs)
        .where(eq(jobs.projectId, projectId))
        .orderBy(desc(jobs.createdAt))
    },

    async hasActiveOfType(type: JobType): Promise<boolean> {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(eq(jobs.type, type), inArray(jobs.status, ["queued", "running"]))
        )
        .limit(1)
      return Boolean(row)
    },

    async countActive(
      projectId: string,
      types?: readonly JobType[]
    ): Promise<number> {
      const filters = [
        eq(jobs.projectId, projectId),
        inArray(jobs.status, ["queued", "running"]),
      ]
      if (types?.length) filters.push(inArray(jobs.type, [...types]))
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(and(...filters))
      return row?.count ?? 0
    },
  }
}
