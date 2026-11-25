import "server-only"

import type { Db } from "@/lib/db"
import { AppError, isRetryable, toAppError } from "@/lib/errors"
import type { Logger } from "@/lib/logger"

import { jobQueue, type Job } from "./queue"
import { RENDER_JOB_TYPES, type JobType } from "./schema"

export const workerShutdown = () =>
  new AppError("CANCELLED", "Worker shutting down", {
    details: { shutdown: true },
  })

export const shuttingDown = (signal: AbortSignal) =>
  signal.reason instanceof AppError && signal.reason.details?.shutdown === true

export type JobContext = {
  job: Job
  db: Db
  logger: Logger
  signal: AbortSignal
  reportProgress: (percent: number) => void
  reportDetail: (detail: Record<string, unknown>) => void
}

export type JobHandler = (ctx: JobContext) => Promise<void>
export type JobHandlers = Partial<Record<JobType, JobHandler>>

export type WorkerOptions = {
  db: Db
  handlers: JobHandlers
  logger: Logger
  owner: string
  concurrency: number
  renderConcurrency: number
  pollMs: number
  leaseMs?: number
  stallTimeoutMs?: (job: Job) => number
  maxRuntimeMs?: number
  onSucceeded?: (job: Job) => Promise<void> | void
  onFinalFailure?: (job: Job, error: AppError) => Promise<void> | void
  onCancelled?: (job: Job) => Promise<void> | void
}

const PROGRESS_WRITE_MS = 500

function formatLimit(ms: number) {
  if (ms >= 60 * 60_000 && ms % (60 * 60_000) === 0) {
    const hours = ms / (60 * 60_000)
    return `${hours} ${hours === 1 ? "hour" : "hours"}`
  }
  if (ms >= 60_000 && ms % 60_000 === 0) {
    const minutes = ms / 60_000
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  }
  return `${ms} ms`
}

type Lane = {
  name: string
  slots: number
  active: Set<Promise<void>>
  types: JobType[]
}

export function createWorker(options: WorkerOptions) {
  const {
    db,
    handlers,
    logger,
    owner,
    pollMs,
    leaseMs = 30_000,
    stallTimeoutMs = () => 30 * 60_000,
    maxRuntimeMs = 24 * 60 * 60_000,
  } = options
  const queue = jobQueue(db)
  const controllers = new Map<string, AbortController>()
  let running = false
  let wake: (() => void) | undefined

  const handled = (Object.keys(handlers) as JobType[]).filter(
    (type) => handlers[type]
  )
  const lanes: Lane[] = [
    {
      name: "render",
      slots: options.renderConcurrency,
      active: new Set(),
      types: handled.filter((type) => RENDER_JOB_TYPES.has(type)),
    },
    {
      name: "default",
      slots: options.concurrency,
      active: new Set(),
      types: handled.filter((type) => !RENDER_JOB_TYPES.has(type)),
    },
  ]

  async function execute(job: Job) {
    const log = logger.child({
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
    })
    const controller = new AbortController()
    controllers.set(job.id, controller)
    let progress = job.progress
    let detail: Record<string, unknown> | undefined
    let detailWritten = true
    let lastWrite = 0
    let abortReason: AppError | undefined

    const abort = (reason: AppError) => {
      if (controller.signal.aborted) return
      abortReason = reason
      controller.abort(reason)
    }

    let beating: Promise<void> | undefined
    const beat = () => {
      if (beating) return
      lastWrite = Date.now()
      detailWritten = true
      beating = queue
        .heartbeat(job.id, owner, leaseMs, progress, detail)
        .then((alive) => {
          if (!alive) abort(new AppError("CANCELLED", "Job was cancelled"))
        })
        .catch((error: unknown) => log.warn({ err: error }, "heartbeat failed"))
        .finally(() => {
          beating = undefined
        })
    }

    const heartbeat = setInterval(
      beat,
      Math.min(2_000, Math.max(100, Math.floor(leaseMs / 3)))
    )
    const stallMs = stallTimeoutMs(job)
    const stalled = () =>
      abort(
        new AppError(
          "TIMEOUT",
          `Job made no progress for ${formatLimit(stallMs)}`
        )
      )
    let stall = setTimeout(stalled, stallMs)
    const alive = () => {
      clearTimeout(stall)
      stall = setTimeout(stalled, stallMs)
    }
    const cap = setTimeout(
      () =>
        abort(
          new AppError(
            "TIMEOUT",
            `Job ran longer than ${formatLimit(maxRuntimeMs)}`
          )
        ),
      maxRuntimeMs
    )

    try {
      const handler = handlers[job.type]
      if (!handler) {
        throw new AppError("INTERNAL", `No handler for job type ${job.type}`)
      }
      log.info("job started")
      await handler({
        job,
        db,
        logger: log,
        signal: controller.signal,
        reportProgress(percent) {
          alive()
          progress = Math.max(0, Math.min(100, percent))
          if (Date.now() - lastWrite >= PROGRESS_WRITE_MS) beat()
        },
        reportDetail(next) {
          alive()
          detail = next
          detailWritten = false
          if (Date.now() - lastWrite >= PROGRESS_WRITE_MS) beat()
        },
      })
      await beating
      if (!detailWritten) {
        beat()
        await beating
      }
      if (abortReason) throw abortReason
      await queue.complete(job.id, owner)
      log.info("job succeeded")
      await options.onSucceeded?.(job)
    } catch (caught) {
      const error = abortReason ?? toAppError(caught)
      if (error.code === "CANCELLED") {
        await queue.cancel(job.id)
        log.info("job cancelled")
        await options.onCancelled?.(job)
        return
      }
      const stderrTail =
        typeof error.details?.stderrTail === "string"
          ? `\n${error.details.stderrTail}`
          : ""
      const updated = await queue.fail(
        job.id,
        owner,
        `${error.message}${stderrTail}`,
        {
          retryable: isRetryable(error),
        }
      )
      if (updated?.status === "failed") {
        log.error({ err: error }, "job failed")
        await options.onFinalFailure?.(updated, error)
      } else {
        log.warn(
          { err: error, attempts: job.attempts },
          "job failed, will retry"
        )
      }
    } finally {
      clearInterval(heartbeat)
      clearTimeout(stall)
      clearTimeout(cap)
      controllers.delete(job.id)
    }
  }

  async function fill(lane: Lane, force = false): Promise<boolean> {
    let started = false
    if (lane.types.length === 0) return false
    while ((running || force) && lane.active.size < lane.slots) {
      const job = await queue.lease({ owner, leaseMs, types: lane.types })
      if (!job) break
      started = true
      const task = execute(job)
        .catch((error: unknown) =>
          logger.error({ err: error, jobId: job.id }, "job bookkeeping failed")
        )
        .finally(() => {
          lane.active.delete(task)
          wake?.()
        })
      lane.active.add(task)
    }
    return started
  }

  let lastRecovery = 0
  async function recover() {
    lastRecovery = Date.now()
    const recovered = await queue.recoverExpired()
    if (recovered) logger.warn({ recovered }, "recovered expired job leases")
  }

  async function loop() {
    while (running) {
      if (Date.now() - lastRecovery >= leaseMs) {
        await recover().catch((error: unknown) =>
          logger.error({ err: error }, "couldn't recover expired leases")
        )
      }
      for (const lane of lanes) {
        await fill(lane).catch((error: unknown) =>
          logger.error({ err: error }, "couldn't lease jobs")
        )
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs)
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      wake = undefined
    }
  }

  let loopPromise: Promise<void> | undefined

  return {
    start() {
      if (running) return
      running = true
      loopPromise = (async () => {
        await loop()
      })()
    },

    async stop({ graceMs = 10_000 } = {}) {
      running = false
      wake?.()
      await loopPromise
      const active = lanes.flatMap((lane) => [...lane.active])
      const drained = Promise.all(active).then(() => true)
      const timedOut = new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), graceMs).unref()
      )
      if (!(await Promise.race([drained, timedOut]))) {
        for (const controller of controllers.values()) {
          controller.abort(workerShutdown())
        }
        await Promise.allSettled(active)
      }
    },

    async drain() {
      while (true) {
        const started = (
          await Promise.all(lanes.map((lane) => fill(lane, true)))
        ).some(Boolean)
        const active = lanes.flatMap((lane) => [...lane.active])
        if (!started && active.length === 0) return
        await Promise.race(active)
      }
    },

    cancelLocal(jobId: string) {
      controllers
        .get(jobId)
        ?.abort(new AppError("CANCELLED", "Job was cancelled"))
    },

    get activeCount() {
      return lanes.reduce((sum, lane) => sum + lane.active.size, 0)
    },
  }
}

export type Worker = ReturnType<typeof createWorker>
