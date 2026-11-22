import "server-only"

import { inArray } from "drizzle-orm"

import { assets, jobs, projects } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import type { JobHandler } from "../../jobs/worker-loop"
import { planSweep, type SweepFile } from "../sweep-plan"
import { throwIfAborted } from "./common"

export const sweepStep: JobHandler = async ({
  db,
  logger,
  signal,
  reportProgress,
}) => {
  const storage = getStorage()
  const files: SweepFile[] = []
  for (const prefix of ["tmp/uploads", "projects"]) {
    for (const key of await storage.list(prefix)) {
      const info = await storage.stat(key)
      if (info) files.push({ key, mtimeMs: info.mtimeMs })
    }
  }
  throwIfAborted(signal)
  reportProgress(40)

  const projectIds = new Set(
    db
      .select({ id: projects.id })
      .from(projects)
      .all()
      .map((row) => row.id)
  )
  const busyProjectIds = new Set(
    db
      .select({ projectId: jobs.projectId })
      .from(jobs)
      .where(inArray(jobs.status, ["queued", "running"]))
      .all()
      .flatMap((row) => (row.projectId ? [row.projectId] : []))
  )
  const referencedKeys = new Set(
    db
      .select({ key: assets.storageKey })
      .from(assets)
      .all()
      .map((row) => row.key)
  )

  const doomed = planSweep({
    files,
    projectIds,
    busyProjectIds,
    referencedKeys,
    nowMs: Date.now(),
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
