import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { transcriptRepository } from "@/features/transcription/repository"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

describe("transcribe step", () => {
  it("extracts 16 kHz mono audio and stores a normalized transcript", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe"])

    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "analyzing"
    )
    const audio = assetRepository(env.db).findByKind(projectId, "audio")
    expect(audio).toMatchObject({ mime: "audio/wav" })
    expect((await getStorage().stat(audio!.storageKey))?.bytes).toBeGreaterThan(
      16_000 * 2 * 19
    )

    const transcript = transcriptRepository(env.db).get(projectId)
    expect(transcript?.language).toBe("en")
    expect(transcript?.words[0]).toMatchObject({ text: "Okay", startMs: 200 })
    expect(transcript?.segments.map((s) => s.text)).toContain(
      "Wait, what is he doing?"
    )
    for (const word of transcript!.words)
      expect(word.endMs).toBeLessThanOrEqual(20_100)

    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .find((j) => j.type === "analyze")?.status
    ).toBe("queued")
  })

  it("is idempotent when re-run", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe"])
    const projects = projectRepository(env.db)
    projects.markFailed(projectId, "boom")
    projects.resumeFailed(projectId, "transcribing")
    jobQueue(env.db).enqueue({ type: "transcribe", projectId })
    await runJobs(env.db, ["transcribe"])
    expect(projects.getOrThrow(projectId).status).toBe("analyzing")
    expect(
      assetRepository(env.db)
        .listForProject(projectId)
        .filter((a) => a.kind === "audio")
    ).toHaveLength(1)
  })
})
