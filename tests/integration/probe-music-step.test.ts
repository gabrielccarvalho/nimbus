import { readFile } from "node:fs/promises"

import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { musicRepository } from "@/features/music/repository"
import { createProcessingTrack, deleteTrack } from "@/features/music/service"
import { AppError } from "@/lib/errors"
import { jobs, user } from "@/lib/db/schema"
import { getStorage, storageKeys } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function processingTrack(file: string) {
  const userId = crypto.randomUUID()
  const owner = { id: userId, name: "Owner", email: `${userId}@example.com` }
  await env.db.insert(user).values(owner)
  const { id: workspaceId } = await accountRepository(
    env.db
  ).createPersonalWorkspace(owner)
  const id = crypto.randomUUID()
  const storageKey = storageKeys.music(workspaceId, id, "m4a")
  const data = await readFile(file)
  await getStorage().writeBuffer(storageKey, data)
  const summary = await createProcessingTrack(env.db, {
    id,
    workspaceId,
    userId,
    title: "Summer loop",
    storageKey,
    mime: "audio/mp4",
    bytes: data.length,
  })
  return { summary, workspaceId, storageKey }
}

const probeJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "probe_music"))

describe("probe_music", () => {
  it("probe_music sets duration and peaks and marks the track ready", async () => {
    const { summary } = await processingTrack(fixtures.tone)
    expect(summary).toMatchObject({
      status: "processing",
      durationMs: null,
      peaks: null,
    })
    expect(await probeJobs()).toMatchObject([
      { projectId: null, payload: { trackId: summary.id }, status: "queued" },
    ])

    await runJobs(env.db, ["probe_music"])

    const track = await musicRepository(env.db).get(summary.id)
    expect(track?.status).toBe("ready")
    expect(track?.error).toBeNull()
    expect(Math.abs((track?.durationMs ?? 0) - 30_000)).toBeLessThanOrEqual(50)
    expect(track?.peaks).toHaveLength(240)
    expect(track?.peaks?.every((p) => p > 0.05 && p <= 1)).toBe(true)
    expect((await probeJobs())[0]?.status).toBe("succeeded")
  })

  it('a file without an audio stream marks the track failed with "This file has no audio"', async () => {
    const { summary, storageKey } = await processingTrack(fixtures.noAudio)

    await runJobs(env.db, ["probe_music"])

    expect(await musicRepository(env.db).get(summary.id)).toMatchObject({
      status: "failed",
      error: "This file has no audio",
      durationMs: null,
      peaks: null,
    })
    expect(await probeJobs()).toMatchObject([{ status: "failed", attempts: 1 }])
    expect(await getStorage().stat(storageKey)).not.toBeNull()
  })

  it("keeps the track processing while a transient failure retries", async () => {
    const { summary } = await processingTrack(fixtures.tone)
    const crash = {
      probe_music: async () => {
        throw new AppError("EXTERNAL", "ffprobe crashed")
      },
    }

    for (const attempt of [1, 2]) {
      await runJobs(env.db, ["probe_music"], crash)
      expect((await musicRepository(env.db).get(summary.id))?.status).toBe(
        "processing"
      )
      expect(await probeJobs()).toMatchObject([
        { status: "queued", attempts: attempt },
      ])
      await env.db.update(jobs).set({ runAfter: new Date(0) })
    }
    await runJobs(env.db, ["probe_music"], crash)

    expect(await musicRepository(env.db).get(summary.id)).toMatchObject({
      status: "failed",
      error: "ffprobe crashed",
    })
  })

  it("a deleted track makes the job a no-op", async () => {
    const { summary, workspaceId, storageKey } = await processingTrack(
      fixtures.tone
    )
    await deleteTrack(env.db, getStorage(), workspaceId, summary.id)

    await runJobs(env.db, ["probe_music"])

    expect(await probeJobs()).toMatchObject([{ status: "succeeded" }])
    expect(await musicRepository(env.db).get(summary.id)).toBeUndefined()
    expect(await getStorage().stat(storageKey)).toBeNull()
  })

  it("deleting a failed track removes its file", async () => {
    const { summary, workspaceId, storageKey } = await processingTrack(
      fixtures.noAudio
    )
    await runJobs(env.db, ["probe_music"])

    await deleteTrack(env.db, getStorage(), workspaceId, summary.id)

    expect(await musicRepository(env.db).get(summary.id)).toBeUndefined()
    expect(await getStorage().stat(storageKey)).toBeNull()
  })
})
