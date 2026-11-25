import { utimes } from "node:fs/promises"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import { getStorage, storageKeys } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function plant(key: string, ageMs: number) {
  const storage = getStorage()
  await storage.writeBuffer(key, "x")
  const when = new Date(Date.now() - ageMs)
  await utimes(path.join(env.dataDir, key), when, when)
}

describe("sweep", () => {
  it("removes orphaned files and keeps everything referenced", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const day = 25 * 60 * 60_000
    await plant(storageKeys.uploadTemp("abandoned"), day)
    await plant(storageKeys.uploadTemp("in-progress"), 1000)
    await plant("projects/deleted-project/source.mp4", day)
    await plant(`projects/${projectId}/work/crashed-graph.txt`, day)
    await plant(storageKeys.render(projectId, "clip", 1), day)

    const before = await getStorage().list(storageKeys.projectPrefix(projectId))
    await jobQueue(env.db).enqueue({ type: "sweep", projectId: null })
    expect(await jobQueue(env.db).hasActiveOfType("sweep")).toBe(true)
    await runJobs(env.db, ["sweep"])

    const storage = getStorage()
    expect(await storage.stat(storageKeys.uploadTemp("abandoned"))).toBeNull()
    expect(
      await storage.stat(storageKeys.uploadTemp("in-progress"))
    ).not.toBeNull()
    expect(await storage.list("projects/deleted-project")).toEqual([])
    const after = await storage.list(storageKeys.projectPrefix(projectId))
    expect(after.sort()).toEqual(
      before
        .filter((key) => !key.includes("/work/") && !key.includes("/renders/"))
        .sort()
    )
    expect(after.some((key) => key.endsWith("source.mp4"))).toBe(true)
  })
})
