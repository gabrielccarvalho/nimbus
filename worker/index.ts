import "@/lib/load-env"

import os from "node:os"

import {
  deleteHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  recordHeartbeat,
  serializeCapabilities,
  type SerializedCapabilities,
} from "@/features/jobs/heartbeat"
import { jobQueue } from "@/features/jobs/queue"
import { createWorker } from "@/features/jobs/worker-loop"
import {
  jobStallTimeoutMs,
  onJobCancelled,
  onJobFinalFailure,
  onJobSucceeded,
  pipelineHandlers,
} from "@/features/pipeline/handlers"
import { enqueueDueAnalyticsSyncs } from "@/features/analytics/service"
import {
  enqueueDueStatsSyncs,
  sweepStaleYouTubeData,
} from "@/features/publishing/stats-service"
import {
  RETENTION_SWEEP_EVERY_MS,
  STATS_SCHEDULE_INTERVAL_MS,
} from "@/features/publishing/stats"
import { SWEEP_INTERVAL_MS } from "@/features/pipeline/sweep-plan"
import { closeDb, getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
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

let retentionSweptAt = 0
const sweepYouTubeData = async () => {
  if (Date.now() - retentionSweptAt < RETENTION_SWEEP_EVERY_MS) return
  retentionSweptAt = Date.now()
  const swept = await sweepStaleYouTubeData(db, new Date())
  logger.info(swept, "swept stale YouTube data")
}

const scheduleStats = () =>
  Promise.all([
    enqueueDueStatsSyncs(db, new Date()).catch((error: unknown) =>
      logger.error({ err: error }, "couldn't schedule stats syncs")
    ),
    enqueueDueAnalyticsSyncs(db, new Date()).catch((error: unknown) =>
      logger.error({ err: error }, "couldn't schedule analytics syncs")
    ),
    sweepYouTubeData().catch((error: unknown) =>
      logger.error({ err: error }, "couldn't sweep stale YouTube data")
    ),
  ])

const unavailableCapabilities: SerializedCapabilities = {
  available: false,
  version: null,
  filters: [],
  encoders: [],
  hasLibass: false,
  hasLibx264: false,
  hardwareEncoders: [],
}
const detectCapabilities = () =>
  getFfmpegCapabilities(env.FFMPEG_PATH).then(serializeCapabilities)
let capabilities = unavailableCapabilities
const beat = () =>
  recordHeartbeat(db, owner, capabilities).catch((error: unknown) =>
    logger.error({ err: error }, "couldn't record the worker heartbeat")
  )
const heartbeatReady = detectCapabilities()
  .then((detected) => {
    capabilities = detected
  })
  .catch((error: unknown) =>
    logger.error({ err: error }, "couldn't detect ffmpeg capabilities")
  )
  .then(beat)

worker.start()
void sweep()
void scheduleStats()
const sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
sweepTimer.unref()
const statsTimer = setInterval(
  () => void scheduleStats(),
  STATS_SCHEDULE_INTERVAL_MS
)
statsTimer.unref()
const heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
heartbeatTimer.unref()
await heartbeatReady
logger.info({ owner, dataDir: env.DATA_DIR }, "worker started")
if (!process.stdout.isTTY || env.E2E) console.log("worker started")

let stopping = false
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1)
    stopping = true
    clearInterval(sweepTimer)
    clearInterval(statsTimer)
    clearInterval(heartbeatTimer)
    logger.info({ signal }, "worker stopping")
    // tsx watch SIGKILLs after 5 s, which would orphan running ffmpeg children;
    // abort early enough for runProcess to terminate them first.
    void worker
      .stop({ graceMs: 1_000 })
      .then(() => deleteHeartbeat(db, owner))
      .catch((error: unknown) =>
        logger.error({ err: error }, "couldn't remove the worker heartbeat")
      )
      .then(closeDb)
      .then(() => process.exit(0))
  })
}
