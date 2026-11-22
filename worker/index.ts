import "@/lib/load-env"

import os from "node:os"

import { createWorker } from "@/features/jobs/worker-loop"
import {
  jobTimeoutMs,
  onJobCancelled,
  onJobFinalFailure,
  pipelineHandlers,
} from "@/features/pipeline/handlers"
import { getDb } from "@/lib/db"
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
  timeoutMs: jobTimeoutMs,
  onFinalFailure: (job, error) => onJobFinalFailure(db, job, error),
  onCancelled: (job) => onJobCancelled(db, job),
})

worker.start()
logger.info({ owner, dataDir: env.DATA_DIR }, "worker started")
if (!process.stdout.isTTY || env.E2E) console.log("worker started")

let stopping = false
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1)
    stopping = true
    logger.info({ signal }, "worker stopping")
    void worker.stop().then(() => {
      db.$client.close()
      process.exit(0)
    })
  })
}
