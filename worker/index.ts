import "@/lib/load-env"

import os from "node:os"

import { pollingFresh, startHealthServer } from "@/features/jobs/health"
import {
  deleteHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  pruneHeartbeats,
  recordHeartbeat,
  serializeCapabilities,
  type SerializedCapabilities,
} from "@/features/jobs/heartbeat"
import { jobQueue } from "@/features/jobs/queue"
import { createWorker, MAX_RUNTIME_MS } from "@/features/jobs/worker-loop"
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
import { removeStaleScratch } from "@/lib/storage/scratch"

const env = getEnv()
const db = getDb()
const owner = `${os.hostname()}:${process.pid}`
const SCRATCH_MARGIN_MS = 60 * 60_000

await removeStaleScratch(MAX_RUNTIME_MS + SCRATCH_MARGIN_MS)
  .then((removed) => {
    if (removed) logger.info({ removed }, "removed stale scratch directories")
  })
  .catch((error: unknown) =>
    logger.error({ err: error }, "couldn't clean the scratch directory")
  )
void pruneHeartbeats(db).catch((error: unknown) =>
  logger.error({ err: error }, "couldn't prune old worker heartbeats")
)

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
const health = env.WORKER_HEALTH_PORT
  ? startHealthServer(env.WORKER_HEALTH_PORT, () =>
      pollingFresh(worker.lastPolledAt, env.WORKER_POLL_MS)
    )
  : undefined
health?.on("error", (error) =>
  logger.error({ err: error }, "couldn't serve the health check")
)
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
    health?.close()
    logger.info({ signal }, "worker stopping")
    void worker
      .stop({ graceMs: env.WORKER_SHUTDOWN_GRACE_MS })
      .then(() => deleteHeartbeat(db, owner))
      .catch((error: unknown) =>
        logger.error({ err: error }, "couldn't remove the worker heartbeat")
      )
      .then(closeDb)
      .then(() => process.exit(0))
  })
}
