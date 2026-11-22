import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { signalsRepository } from "@/features/analysis/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"

import { FIXTURE_SILENCES_S, fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

describe("analyze step", () => {
  it("finds the fixture's silences, loudness and speech density", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze"])

    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "selecting"
    )
    const signals = signalsRepository(env.db).get(projectId)!

    expect(signals.silences).toHaveLength(FIXTURE_SILENCES_S.length)
    signals.silences.forEach((silence, i) => {
      const [start, end] = FIXTURE_SILENCES_S[i]!
      expect(Math.abs(silence.startMs - start * 1000)).toBeLessThan(100)
      expect(Math.abs(silence.endMs - end * 1000)).toBeLessThan(100)
    })

    expect(signals.loudnessIntervalMs).toBe(250)
    expect(signals.loudness).toHaveLength(80)
    const at = (ms: number) => signals.loudness[Math.floor(ms / 250)]!
    expect(at(2000)).toBeGreaterThan(-40)
    expect(at(2000)).toBeLessThan(0)
    expect(at(5000)).toBe(-70)
    expect(at(12_500)).toBe(-70)

    expect(signals.speechDensity.map((w) => w.startMs)).toEqual([
      0, 5000, 10_000,
    ])
    expect(signals.speechDensity[0]!.wordsPerSecond).toBeGreaterThan(0)

    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .find((j) => j.type === "select")?.status
    ).toBe("queued")
  })
})
