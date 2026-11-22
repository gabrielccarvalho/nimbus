import path from "node:path"
import { execFile } from "node:child_process"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { backoffMs, jobQueue } from "@/features/jobs/queue"
import { createWorker, type JobHandlers } from "@/features/jobs/worker-loop"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

function project() {
  return projectRepository(env.db).create({
    name: "p",
    settings: defaultProjectSettings,
  })
}

function worker(handlers: JobHandlers, overrides = {}) {
  return createWorker({
    db: env.db,
    handlers,
    logger,
    owner: "test-worker",
    concurrency: 2,
    renderConcurrency: 1,
    pollMs: 20,
    leaseMs: 300,
    ...overrides,
  })
}

describe("jobQueue", () => {
  it("leases in order and never twice", () => {
    const queue = jobQueue(env.db)
    const p = project()
    const a = queue.enqueue({ type: "probe", projectId: p.id })
    const b = queue.enqueue({ type: "analyze", projectId: p.id })
    expect(queue.lease({ owner: "w1", leaseMs: 1000 })?.id).toBe(a.id)
    expect(queue.lease({ owner: "w2", leaseMs: 1000 })?.id).toBe(b.id)
    expect(queue.lease({ owner: "w3", leaseMs: 1000 })).toBeUndefined()
    expect(queue.get(a.id)).toMatchObject({
      status: "running",
      attempts: 1,
      leaseOwner: "w1",
    })
  })

  it("filters by type lanes and respects runAfter", () => {
    const queue = jobQueue(env.db)
    const p = project()
    queue.enqueue({
      type: "render_clip",
      projectId: p.id,
      payload: { clipId: "c" },
    })
    queue.enqueue({
      type: "probe",
      projectId: p.id,
      runAfter: new Date(Date.now() + 60_000),
    })
    expect(
      queue.lease({ owner: "w", leaseMs: 1000, excludeTypes: ["render_clip"] })
    ).toBeUndefined()
    expect(
      queue.lease({ owner: "w", leaseMs: 1000, types: ["render_clip"] })?.type
    ).toBe("render_clip")
  })

  it("retries with exponential backoff, then fails", () => {
    const queue = jobQueue(env.db)
    const p = project()
    const job = queue.enqueue({
      type: "probe",
      projectId: p.id,
      maxAttempts: 2,
    })

    queue.lease({ owner: "w", leaseMs: 1000 })
    const retried = queue.fail(job.id, "w", "boom", { retryable: true })
    expect(retried?.status).toBe("queued")
    expect(retried!.runAfter.getTime()).toBeGreaterThan(Date.now() + 1000)

    env.db.$client
      .prepare("update jobs set run_after = 0 where id = ?")
      .run(job.id)
    queue.lease({ owner: "w", leaseMs: 1000 })
    expect(
      queue.fail(job.id, "w", "boom again", { retryable: true })
    ).toMatchObject({ status: "failed", error: "boom again", attempts: 2 })
  })

  it("fails immediately when not retryable", () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({ type: "probe", projectId: project().id })
    queue.lease({ owner: "w", leaseMs: 1000 })
    expect(
      queue.fail(job.id, "w", "no ffmpeg", { retryable: false })?.status
    ).toBe("failed")
  })

  it("ignores completions from a worker that lost the lease", () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({ type: "probe", projectId: project().id })
    queue.lease({ owner: "w1", leaseMs: 1000 })
    expect(queue.complete(job.id, "intruder")).toBe(false)
    expect(queue.heartbeat(job.id, "intruder", 1000)).toBe(false)
    expect(queue.complete(job.id, "w1")).toBe(true)
  })

  it("recovers expired leases on startup", () => {
    const queue = jobQueue(env.db)
    const p = project()
    const alive = queue.enqueue({ type: "probe", projectId: p.id })
    const exhausted = queue.enqueue({
      type: "analyze",
      projectId: p.id,
      maxAttempts: 1,
    })
    queue.lease({ owner: "crashed", leaseMs: 1 })
    queue.lease({ owner: "crashed", leaseMs: 1 })
    env.db.$client.prepare("update jobs set leased_until = 0").run()
    expect(queue.recoverExpired()).toBe(2)
    expect(queue.get(alive.id)?.status).toBe("queued")
    expect(queue.get(exhausted.id)?.status).toBe("failed")
  })

  it("computes capped backoff", () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(50)).toBe(5 * 60_000)
  })

  it("never double-leases across concurrent connections", async () => {
    const queue = jobQueue(env.db)
    const p = project()
    for (let i = 0; i < 120; i++)
      queue.enqueue({ type: "probe", projectId: p.id })

    const script = path.resolve(
      import.meta.dirname,
      "../utils/lease-process.ts"
    )
    const processes = Array.from(
      { length: 4 },
      (_, index) =>
        new Promise<string[]>((resolve, reject) => {
          execFile(
            process.execPath,
            [
              "--conditions=react-server",
              "--import",
              "tsx",
              script,
              process.env.DATABASE_PATH!,
              `p${index}`,
            ],
            (error, stdout) =>
              error ? reject(error) : resolve(JSON.parse(stdout) as string[])
          )
        })
    )
    const results = await Promise.all(processes)
    const all = results.flat()
    expect(all).toHaveLength(120)
    expect(new Set(all).size).toBe(120)
  }, 60_000)
})

describe("worker loop", () => {
  it("runs handlers, reports progress and completes jobs", async () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({ type: "probe", projectId: project().id })
    const seen: number[] = []
    const w = worker({
      probe: async ({ reportProgress }) => {
        reportProgress(50)
        seen.push(50)
      },
    })
    await w.drain()
    expect(seen).toEqual([50])
    expect(queue.get(job.id)).toMatchObject({
      status: "succeeded",
      progress: 100,
    })
  })

  it("retries retryable errors and reports final failures", async () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({
      type: "probe",
      projectId: project().id,
      maxAttempts: 1,
    })
    const onFinalFailure = vi.fn()
    const w = worker(
      {
        probe: async () => {
          throw new AppError("EXTERNAL", "ffprobe crashed", {
            details: { stderrTail: "moov atom not found" },
          })
        },
      },
      { onFinalFailure }
    )
    await w.drain()
    expect(queue.get(job.id)?.status).toBe("failed")
    expect(queue.get(job.id)?.error).toContain("moov atom not found")
    expect(onFinalFailure).toHaveBeenCalledOnce()
  })

  it("aborts a running job when it is cancelled elsewhere", async () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({ type: "probe", projectId: project().id })
    let aborted = false
    const onCancelled = vi.fn()
    const w = worker(
      {
        probe: ({ signal }) =>
          new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true
              resolve()
            })
            setTimeout(() => queue.cancel(job.id), 50)
          }),
      },
      { onCancelled }
    )
    await w.drain()
    expect(aborted).toBe(true)
    expect(queue.get(job.id)?.status).toBe("cancelled")
    expect(onCancelled).toHaveBeenCalledOnce()
  })

  it("times out slow jobs", async () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({
      type: "probe",
      projectId: project().id,
      maxAttempts: 1,
    })
    const w = worker(
      {
        probe: ({ signal }) =>
          new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve())
          ),
      },
      { timeoutMs: () => 50 }
    )
    await w.drain()
    expect(queue.get(job.id)).toMatchObject({ status: "failed" })
    expect(queue.get(job.id)?.error).toMatch(/timed out/)
  })

  it("limits render concurrency separately", async () => {
    const queue = jobQueue(env.db)
    const p = project()
    for (let i = 0; i < 3; i++) {
      queue.enqueue({
        type: "render_clip",
        projectId: p.id,
        payload: { clipId: `${i}` },
      })
    }
    let active = 0
    let peak = 0
    const w = worker({
      render_clip: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 30))
        active--
      },
    })
    await w.drain()
    expect(peak).toBe(1)
  })

  it("stops gracefully, letting active jobs finish", async () => {
    const queue = jobQueue(env.db)
    const job = queue.enqueue({ type: "probe", projectId: project().id })
    const w = worker({
      probe: () => new Promise((r) => setTimeout(r, 100)),
    })
    w.start()
    await vi.waitFor(() => expect(w.activeCount).toBe(1))
    await w.stop()
    expect(queue.get(job.id)?.status).toBe("succeeded")
  })
})
