import "@/lib/load-env"

import os from "node:os"

import { jobQueue } from "@/features/jobs/queue"
import { createWorker } from "@/features/jobs/worker-loop"
import {
  jobStallTimeoutMs,
  onJobCancelled,
  onJobFinalFailure,
  onJobSucceeded,
  pipelineHandlers,
} from "@/features/pipeline/handlers"
import { SWEEP_INTERVAL_MS } from "@/features/pipeline/sweep-plan"
import { closeDb, getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"

const env = getEnv()
const db = getDb()
const owner = `${os.hostname()}:${process.pid}`

const worker = createWorker({
  db,
  handlers: pipelineHandlers,
  logger,
  owner,
  concurrency: env.WORKER_CONCURRENCY,
  renderConcurrency: env.WORKER_RENDER_CONCURRENCY,
  pollMs: env.WORKER_POLL_MS,
  stallTimeoutMs: jobStallTimeoutMs,
  onSucceeded: (job) => onJobSucceeded(db, job),
  onFinalFailure: (job, error) => onJobFinalFailure(db, job, error),
  onCancelled: (job) => onJobCancelled(db, job),
})

const scheduleSweep = async () => {
  const queue = jobQueue(db)
  if (!(await queue.hasActiveOfType("sweep"))) {
    await queue.enqueue({ type: "sweep", projectId: null, maxAttempts: 1 })
  }
}
const sweep = () =>
  scheduleSweep().catch((error: unknown) =>
    logger.error({ err: error }, "couldn't schedule the sweep")
  )

worker.start()
void sweep()
const sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
sweepTimer.unref()
logger.info({ owner, dataDir: env.DATA_DIR }, "worker started")
if (!process.stdout.isTTY || env.E2E) console.log("worker started")

let stopping = false
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1)
    stopping = true
    clearInterval(sweepTimer)
    logger.info({ signal }, "worker stopping")
    // tsx watch SIGKILLs after 5 s, which would orphan running ffmpeg children;
    // abort early enough for runProcess to terminate them first.
    void worker
      .stop({ graceMs: 1_000 })
      .then(closeDb)
      .then(() => process.exit(0))
  })
}
