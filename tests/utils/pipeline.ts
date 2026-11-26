import { readFile } from "node:fs/promises"

import { eq } from "drizzle-orm"

import type { JobType } from "@/features/jobs/schema"
import { createWorker, type JobHandlers } from "@/features/jobs/worker-loop"
import { layoutInputSchema, type LayoutInput } from "@/features/layout/schema"
import {
  jobStallTimeoutMs,
  onJobCancelled,
  onJobFinalFailure,
  onJobSucceeded,
  pipelineHandlers,
} from "@/features/pipeline/handlers"
import {
  ACCEPTED_VIDEO_TYPES,
  mimeFromFileName,
} from "@/features/projects/media-type"
import type { ImportOptions } from "@/features/projects/schema"
import { createUploadedProject } from "@/features/projects/upload"
import { newId, type Db } from "@/lib/db"
import { clips } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { getStorage, storageKeys } from "@/lib/storage"

export async function uploadFixture(
  file: string,
  name = "fixture.mp4",
  options: ImportOptions = {}
) {
  const data = await readFile(file)
  const mime = mimeFromFileName(name) ?? "video/mp4"
  const projectId = newId()
  const sourceKey = storageKeys.source(projectId, ACCEPTED_VIDEO_TYPES[mime])
  await getStorage().writeBuffer(sourceKey, data)
  return createUploadedProject({
    projectId,
    sourceKey,
    fileName: name,
    mime,
    bytes: data.length,
    options,
    workspaceId: null,
  })
}

export function testWorker(db: Db, handlers: JobHandlers = pipelineHandlers) {
  return createWorker({
    db,
    handlers,
    logger,
    owner: "integration",
    concurrency: 1,
    renderConcurrency: 1,
    pollMs: 10,
    leaseMs: 60_000,
    stallTimeoutMs: jobStallTimeoutMs,
    onSucceeded: (job) => onJobSucceeded(db, job),
    onFinalFailure: (job, error) => onJobFinalFailure(db, job, error),
    onCancelled: (job) => onJobCancelled(db, job),
  })
}

export async function runJobs(
  db: Db,
  types: JobType[],
  handlers: JobHandlers = pipelineHandlers
) {
  const subset = Object.fromEntries(
    types.map((type) => [type, handlers[type]])
  ) as JobHandlers
  await testWorker(db, subset).drain()
}

export async function setClipLayouts(
  db: Db,
  projectId: string,
  layout: LayoutInput
) {
  await db
    .update(clips)
    .set({ layout: layoutInputSchema.parse(layout) })
    .where(eq(clips.projectId, projectId))
}
