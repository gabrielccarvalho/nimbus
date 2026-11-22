import { readFile } from "node:fs/promises"

import type { JobType } from "@/features/jobs/schema"
import { createWorker, type JobHandlers } from "@/features/jobs/worker-loop"
import {
  jobTimeoutMs,
  onJobCancelled,
  onJobFinalFailure,
  pipelineHandlers,
} from "@/features/pipeline/handlers"
import { handleUpload } from "@/features/projects/upload"
import type { Db } from "@/lib/db"
import { logger } from "@/lib/logger"

export async function uploadFixture(file: string, name = "fixture.mp4") {
  const data = await readFile(file)
  return handleUpload(
    new Request("http://localhost/api/uploads", {
      method: "POST",
      body: data,
      headers: { "content-type": "video/mp4", "x-file-name": name },
    })
  )
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
    timeoutMs: jobTimeoutMs,
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
