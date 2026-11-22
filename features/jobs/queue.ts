import "server-only"

import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm"

import { newId, now, type Db } from "@/lib/db"
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
  return {
    enqueue(input: EnqueueInput): Job {
      return db
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
        .get()
    },

    lease({
      owner,
      leaseMs,
      types,
      excludeTypes,
    }: LeaseInput): Job | undefined {
      const at = now()
      const filters = [eq(jobs.status, "queued"), lte(jobs.runAfter, at)]
      if (types?.length) filters.push(inArray(jobs.type, [...types]))
      if (excludeTypes?.length) {
        filters.push(sql`${jobs.type} not in ${[...excludeTypes]}`)
      }
      const next = db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(...filters))
        .orderBy(asc(jobs.runAfter), asc(jobs.createdAt))
        .limit(1)
      return db
        .update(jobs)
        .set({
          status: "running",
          leaseOwner: owner,
          leasedUntil: new Date(at.getTime() + leaseMs),
          attempts: sql`${jobs.attempts} + 1`,
          startedAt: sql`coalesce(${jobs.startedAt}, ${at.getTime()})`,
          updatedAt: at,
        })
        .where(and(eq(jobs.id, sql`(${next})`), eq(jobs.status, "queued")))
        .returning()
        .get()
    },

    heartbeat(
      id: string,
      owner: string,
      leaseMs: number,
      progress?: number
    ): boolean {
      const at = now()
      const result = db
        .update(jobs)
        .set({
          leasedUntil: new Date(at.getTime() + leaseMs),
          updatedAt: at,
          ...(progress === undefined
            ? {}
            : { progress: Math.max(0, Math.min(100, progress)) }),
        })
        .where(
          and(
            eq(jobs.id, id),
            eq(jobs.leaseOwner, owner),
            eq(jobs.status, "running")
          )
        )
        .run()
      return result.changes > 0
    },

    complete(id: string, owner: string): boolean {
      const at = now()
      const result = db
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
        .run()
      return result.changes > 0
    },

    fail(
      id: string,
      owner: string,
      message: string,
      { retryable }: { retryable: boolean }
    ): Job | undefined {
      const current = db.select().from(jobs).where(eq(jobs.id, id)).get()
      if (
        !current ||
        current.leaseOwner !== owner ||
        current.status !== "running"
      ) {
        return current
      }
      const at = now()
      const retry = retryable && current.attempts < current.maxAttempts
      return db
        .update(jobs)
        .set(
          retry
            ? {
                status: "queued",
                leaseOwner: null,
                leasedUntil: null,
                runAfter: new Date(at.getTime() + backoffMs(current.attempts)),
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
        .get()
    },

    cancel(id: string): boolean {
      const at = now()
      const result = db
        .update(jobs)
        .set({ status: "cancelled", finishedAt: at, updatedAt: at })
        .where(
          and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"]))
        )
        .run()
      return result.changes > 0
    },

    cancelForProject(projectId: string, types?: readonly JobType[]): number {
      const at = now()
      const filters = [
        eq(jobs.projectId, projectId),
        inArray(jobs.status, ["queued", "running"]),
      ]
      if (types?.length) filters.push(inArray(jobs.type, [...types]))
      return db
        .update(jobs)
        .set({ status: "cancelled", finishedAt: at, updatedAt: at })
        .where(and(...filters))
        .run().changes
    },

    recoverExpired(): number {
      const at = now()
      const expired = db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "running"), lt(jobs.leasedUntil, at)))
        .all()
      for (const job of expired) {
        const exhausted = job.attempts >= job.maxAttempts
        db.update(jobs)
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
          .run()
      }
      return expired.length
    },

    get(id: string): Job | undefined {
      return db.select().from(jobs).where(eq(jobs.id, id)).get()
    },

    listForProject(projectId: string): Job[] {
      return db
        .select()
        .from(jobs)
        .where(eq(jobs.projectId, projectId))
        .orderBy(desc(jobs.createdAt))
        .all()
    },

    hasActiveOfType(type: JobType): boolean {
      return Boolean(
        db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              eq(jobs.type, type),
              inArray(jobs.status, ["queued", "running"])
            )
          )
          .get()
      )
    },

    countActive(projectId: string, types?: readonly JobType[]): number {
      const filters = [
        eq(jobs.projectId, projectId),
        inArray(jobs.status, ["queued", "running"]),
      ]
      if (types?.length) filters.push(inArray(jobs.type, [...types]))
      return (
        db
          .select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(and(...filters))
          .get()?.count ?? 0
      )
    },
  }
}
