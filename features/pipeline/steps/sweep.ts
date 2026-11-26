import "server-only"

import { inArray } from "drizzle-orm"

import { assets, jobs, musicTracks, projects } from "@/lib/db/schema"
import { getStorage, type StorageAdapter } from "@/lib/storage"

import type { JobContext, JobHandler } from "../../jobs/worker-loop"
import { planSweep, SWEEP_MIN_AGE_MS, type SweepFile } from "../sweep-plan"
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
  for (const prefix of ["tmp/uploads", "tmp/downloads", "projects", "music"]) {
    files.push(...(await storage.listWithInfo(prefix)))
  }
  throwIfAborted(signal)
  reportProgress(40)

  const projectIds = new Set(
    (await db.select({ id: projects.id }).from(projects)).map((row) => row.id)
  )
  const trackIds = new Set(
    (await db.select({ id: musicTracks.id }).from(musicTracks)).map(
      (row) => row.id
    )
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
    trackIds,
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
  const aborted = await storage.abortStaleUploads(
    new Date(nowMs - SWEEP_MIN_AGE_MS.upload)
  )
  if (aborted > 0) logger.info({ aborted }, "aborted stale uploads")
  reportProgress(100)
}

export const sweepStep: JobHandler = (ctx) => sweep(ctx, getStorage())
