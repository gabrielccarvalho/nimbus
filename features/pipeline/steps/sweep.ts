import "server-only"

import { inArray } from "drizzle-orm"

import { assets, jobs, projects } from "@/lib/db/schema"
import { getStorage, type StorageAdapter } from "@/lib/storage"

import type { JobContext, JobHandler } from "../../jobs/worker-loop"
import { planSweep, type SweepFile } from "../sweep-plan"
import { throwIfAborted } from "./common"

export async function sweep(
  {
    db,
    logger,
    signal,
    reportProgress,
  }: Pick<JobContext, "db" | "logger" | "signal" | "reportProgress">,
  storage: StorageAdapter,
  nowMs = Date.now()
) {
  const files: SweepFile[] = []
  for (const prefix of ["tmp/uploads", "tmp/downloads", "projects"]) {
    for (const key of await storage.list(prefix)) {
      const info = await storage.stat(key)
      if (info) files.push({ key, mtimeMs: info.mtimeMs })
    }
  }
  throwIfAborted(signal)
  reportProgress(40)

  const projectIds = new Set(
    (await db.select({ id: projects.id }).from(projects)).map((row) => row.id)
  )
  const busyProjectIds = new Set(
    (
      await db
        .select({ projectId: jobs.projectId })
        .from(jobs)
        .where(inArray(jobs.status, ["queued", "running"]))
    ).flatMap((row) => (row.projectId ? [row.projectId] : []))
  )
  const referencedKeys = new Set(
    (await db.select({ key: assets.storageKey }).from(assets)).map(
      (row) => row.key
    )
  )

  const doomed = planSweep({
    files,
    projectIds,
    busyProjectIds,
    referencedKeys,
    nowMs,
  })
  for (const key of doomed) {
    throwIfAborted(signal)
    await storage.remove(key)
  }
  if (doomed.length > 0) {
    logger.info({ removed: doomed.length }, "swept orphaned files")
  }
  reportProgress(100)
}

export const sweepStep: JobHandler = (ctx) => sweep(ctx, getStorage())
