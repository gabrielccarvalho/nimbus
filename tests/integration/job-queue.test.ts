import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { backoffMs, jobQueue } from "@/features/jobs/queue"
import { createWorker, type JobHandlers } from "@/features/jobs/worker-loop"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function project() {
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
  it("leases in order and never twice", async () => {
    const queue = jobQueue(env.db)
    const p = await project()
    const a = await queue.enqueue({ type: "probe", projectId: p.id })
    const b = await queue.enqueue({ type: "analyze", projectId: p.id })
    expect((await queue.lease({ owner: "w1", leaseMs: 1000 }))?.id).toBe(a.id)
    expect((await queue.lease({ owner: "w2", leaseMs: 1000 }))?.id).toBe(b.id)
    expect(await queue.lease({ owner: "w3", leaseMs: 1000 })).toBeUndefined()
    expect(await queue.get(a.id)).toMatchObject({
      status: "running",
      attempts: 1,
      leaseOwner: "w1",
    })
  })

  it("filters by type lanes and respects runAfter", async () => {
    const queue = jobQueue(env.db)
    const p = await project()
    await queue.enqueue({
      type: "render_clip",
      projectId: p.id,
      payload: { clipId: "c" },
    })
    await queue.enqueue({
      type: "probe",
      projectId: p.id,
      runAfter: new Date(Date.now() + 60_000),
    })
    expect(
      await queue.lease({
        owner: "w",
        leaseMs: 1000,
        excludeTypes: ["render_clip"],
      })
    ).toBeUndefined()
    expect(
      (await queue.lease({ owner: "w", leaseMs: 1000, types: ["render_clip"] }))
        ?.type
    ).toBe("render_clip")
  })

  it("retries with exponential backoff, then fails", async () => {
    const queue = jobQueue(env.db)
    const p = await project()
    const job = await queue.enqueue({
      type: "probe",
      projectId: p.id,
      maxAttempts: 2,
    })

    await queue.lease({ owner: "w", leaseMs: 1000 })
    const retried = await queue.fail(job.id, "w", "boom", { retryable: true })
    expect(retried?.status).toBe("queued")
    expect(retried!.runAfter.getTime()).toBeGreaterThan(Date.now() + 1000)

    await env.db.execute(
      sql`update jobs set run_after = now() - interval '1 hour' where id = ${job.id}`
    )
    await queue.lease({ owner: "w", leaseMs: 1000 })
    expect(
      await queue.fail(job.id, "w", "boom again", { retryable: true })
    ).toMatchObject({ status: "failed", error: "boom again", attempts: 2 })
  })

  it("fails immediately when not retryable", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
    })
    await queue.lease({ owner: "w", leaseMs: 1000 })
    expect(
      (await queue.fail(job.id, "w", "no ffmpeg", { retryable: false }))?.status
    ).toBe("failed")
  })

  it("ignores completions from a worker that lost the lease", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
    })
    await queue.lease({ owner: "w1", leaseMs: 1000 })
    expect(await queue.complete(job.id, "intruder")).toBe(false)
    expect(await queue.heartbeat(job.id, "intruder", 1000)).toBe(false)
    expect(await queue.complete(job.id, "w1")).toBe(true)
  })

  it("recovers expired leases on startup", async () => {
    const queue = jobQueue(env.db)
    const p = await project()
    const alive = await queue.enqueue({ type: "probe", projectId: p.id })
    const exhausted = await queue.enqueue({
      type: "analyze",
      projectId: p.id,
      maxAttempts: 1,
    })
    await queue.lease({ owner: "crashed", leaseMs: 1 })
    await queue.lease({ owner: "crashed", leaseMs: 1 })
    await env.db.execute(
      sql`update jobs set leased_until = now() - interval '1 hour'`
    )
    expect(await queue.recoverExpired()).toBe(2)
    expect((await queue.get(alive.id))?.status).toBe("queued")
    expect((await queue.get(exhausted.id))?.status).toBe("failed")
  })

  it("computes capped backoff", () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(50)).toBe(5 * 60_000)
  })
})

describe("worker loop", () => {
  it("runs handlers, reports progress and completes jobs", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
    })
    const seen: number[] = []
    const w = worker({
      probe: async ({ reportProgress }) => {
        reportProgress(50)
        seen.push(50)
      },
    })
    await w.drain()
    expect(seen).toEqual([50])
    expect(await queue.get(job.id)).toMatchObject({
      status: "succeeded",
      progress: 100,
    })
  })

  it("retries retryable errors and reports final failures", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
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
    expect((await queue.get(job.id))?.status).toBe("failed")
    expect((await queue.get(job.id))?.error).toContain("moov atom not found")
    expect(onFinalFailure).toHaveBeenCalledOnce()
  })

  it("aborts a running job when it is cancelled elsewhere", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
    })
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
            setTimeout(() => void queue.cancel(job.id), 50)
          }),
      },
      { onCancelled }
    )
    await w.drain()
    expect(aborted).toBe(true)
    expect((await queue.get(job.id))?.status).toBe("cancelled")
    expect(onCancelled).toHaveBeenCalledOnce()
  })

  it("times out slow jobs", async () => {
    const queue = jobQueue(env.db)
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
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
    expect(await queue.get(job.id)).toMatchObject({ status: "failed" })
    expect((await queue.get(job.id))?.error).toMatch(/timed out/)
  })

  it("limits render concurrency separately", async () => {
    const queue = jobQueue(env.db)
    const p = await project()
    for (let i = 0; i < 3; i++) {
      await queue.enqueue({
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
    const job = await queue.enqueue({
      type: "probe",
      projectId: (await project()).id,
    })
    const w = worker({
      probe: () => new Promise((r) => setTimeout(r, 100)),
    })
    w.start()
    await vi.waitFor(() => expect(w.activeCount).toBe(1))
    await w.stop()
    expect((await queue.get(job.id))?.status).toBe("succeeded")
  })
})
