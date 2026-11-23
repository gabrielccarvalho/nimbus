import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import { stepDetailSchema } from "@/features/pipeline/detail"
import { getProjectSnapshot } from "@/features/pipeline/snapshot"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("step details", () => {
  it("records what each step saw", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const jobs = await jobQueue(env.db).listForProject(projectId)
    const detail = (type: string) =>
      stepDetailSchema.parse(jobs.find((job) => job.type === type)!.detail)

    expect(detail("transcribe")).toMatchObject({
      kind: "transcribe",
      phase: "transcribing",
      languageSource: expect.any(String),
    })
    const transcribe = detail("transcribe")
    expect(
      transcribe.kind === "transcribe" && transcribe.words
    ).toBeGreaterThan(0)

    const analyze = detail("analyze")
    expect(analyze).toMatchObject({ kind: "analyze" })
    if (analyze.kind !== "analyze") throw new Error("wrong kind")
    expect(analyze.waveform.length).toBeGreaterThan(0)
    expect(analyze.waveform.length).toBeLessThanOrEqual(240)
    expect(analyze.analyzedMs).toBeGreaterThan(0)

    const select = detail("select")
    expect(select).toMatchObject({ kind: "select", parts: null })
    if (select.kind !== "select") throw new Error("wrong kind")
    expect(select.candidates.length).toBeGreaterThan(0)
  })

  it("exposes the running job's detail and start time", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    const queue = jobQueue(env.db)
    const job = (await queue.lease({ owner: "test", leaseMs: 60_000 }))!
    expect(
      await queue.heartbeat(job.id, "test", 60_000, 40, {
        kind: "download",
        downloadedBytes: 10,
        totalBytes: 100,
        bytesPerSecond: 5,
        etaSeconds: 18,
      })
    ).toBe(true)

    const snapshot = await getProjectSnapshot(env.db, projectId)
    const running = snapshot!.jobs.find((j) => j.id === job.id)!
    expect(running.detail).toMatchObject({ kind: "download", etaSeconds: 18 })
    expect(running.startedAt).toEqual(expect.any(String))
    expect(running.progress).toBe(40)
  })
})
