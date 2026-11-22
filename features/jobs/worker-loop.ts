import "server-only"

import type { Db } from "@/lib/db"
import { AppError, isRetryable, toAppError } from "@/lib/errors"
import type { Logger } from "@/lib/logger"

import { jobQueue, type Job } from "./queue"
import { RENDER_JOB_TYPES, type JobType } from "./schema"

export type JobContext = {
  job: Job
  db: Db
  logger: Logger
  signal: AbortSignal
  reportProgress: (percent: number) => void
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
  timeoutMs?: (job: Job) => number
  onFinalFailure?: (job: Job, error: AppError) => void
  onCancelled?: (job: Job) => void
}

const PROGRESS_WRITE_MS = 500
const renderTypes = [...RENDER_JOB_TYPES]

type Lane = {
  name: string
  slots: number
  active: Set<Promise<void>>
  filter: { types?: JobType[]; excludeTypes?: JobType[] }
}

export function createWorker(options: WorkerOptions) {
  const {
    db,
    handlers,
    logger,
    owner,
    pollMs,
    leaseMs = 30_000,
    timeoutMs = () => 30 * 60_000,
  } = options
  const queue = jobQueue(db)
  const controllers = new Map<string, AbortController>()
  let running = false
  let wake: (() => void) | undefined

  const lanes: Lane[] = [
    {
      name: "render",
      slots: options.renderConcurrency,
      active: new Set(),
      filter: { types: renderTypes },
    },
    {
      name: "default",
      slots: options.concurrency,
      active: new Set(),
      filter: { excludeTypes: renderTypes },
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
    let lastWrite = 0
    let abortReason: AppError | undefined

    const abort = (reason: AppError) => {
      if (controller.signal.aborted) return
      abortReason = reason
      controller.abort(reason)
    }

    const beat = () => {
      const alive = queue.heartbeat(job.id, owner, leaseMs, progress)
      lastWrite = Date.now()
      if (!alive) abort(new AppError("CANCELLED", "Job was cancelled"))
    }

    const heartbeat = setInterval(
      beat,
      Math.min(2_000, Math.max(100, Math.floor(leaseMs / 3)))
    )
    const timeout = setTimeout(
      () =>
        abort(
          new AppError("TIMEOUT", `Job timed out after ${timeoutMs(job)} ms`)
        ),
      timeoutMs(job)
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
          progress = Math.max(0, Math.min(100, percent))
          if (Date.now() - lastWrite >= PROGRESS_WRITE_MS) beat()
        },
      })
      if (abortReason) throw abortReason
      queue.complete(job.id, owner)
      log.info("job succeeded")
    } catch (caught) {
      const error = abortReason ?? toAppError(caught)
      if (error.code === "CANCELLED") {
        queue.cancel(job.id)
        log.info("job cancelled")
        options.onCancelled?.(job)
        return
      }
      const stderrTail =
        typeof error.details?.stderrTail === "string"
          ? `\n${error.details.stderrTail}`
          : ""
      const updated = queue.fail(
        job.id,
        owner,
        `${error.message}${stderrTail}`,
        {
          retryable: isRetryable(error),
        }
      )
      if (updated?.status === "failed") {
        log.error({ err: error }, "job failed")
        options.onFinalFailure?.(updated, error)
      } else {
        log.warn(
          { err: error, attempts: job.attempts },
          "job failed, will retry"
        )
      }
    } finally {
      clearInterval(heartbeat)
      clearTimeout(timeout)
      controllers.delete(job.id)
    }
  }

  function fill(lane: Lane, force = false): boolean {
    let started = false
    while ((running || force) && lane.active.size < lane.slots) {
      const job = queue.lease({ owner, leaseMs, ...lane.filter })
      if (!job) break
      started = true
      const task = execute(job).finally(() => {
        lane.active.delete(task)
        wake?.()
      })
      lane.active.add(task)
    }
    return started
  }

  async function loop() {
    while (running) {
      lanes.forEach((lane) => fill(lane))
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
      const recovered = queue.recoverExpired()
      if (recovered) logger.warn({ recovered }, "recovered expired job leases")
      loopPromise = loop()
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
          controller.abort(new AppError("CANCELLED", "Worker shutting down"))
        }
        await Promise.allSettled(active)
      }
    },

    async drain() {
      while (true) {
        const started = lanes.map((lane) => fill(lane, true)).some(Boolean)
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
