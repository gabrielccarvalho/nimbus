import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { publishingRepository } from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import { sweepStaleYouTubeData } from "@/features/publishing/stats-service"
import { analyticsRepository } from "@/features/analytics/repository"
import { account, user, workspaces } from "@/lib/db/schema"

import { insertImportedPublication } from "../utils/publications"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const DAY_MS = 86_400_000

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed() {
  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db
    .insert(account)
    .values({ id: accountId, accountId: "g-1", providerId: "google", userId })
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  return publishingRepository(env.db).upsertChannel({
    workspaceId,
    accountId,
    channelId: "UC1",
    title: "Channel",
  })
}

const snapshot = (publicationId: string, fetchedAt: Date) =>
  statsRepository(env.db).add({
    publicationId,
    views: 1,
    likes: 0,
    comments: 0,
    fetchedAt,
  })

describe("sweepStaleYouTubeData", () => {
  it("deletes snapshots older than 30 days and keeps fresh ones and analytics", async () => {
    const channel = await seed()
    const now = new Date()
    const publication = await insertImportedPublication(env.db, channel.id)
    const old = await snapshot(
      publication.id,
      new Date(now.getTime() - 31 * DAY_MS)
    )
    const fresh = await snapshot(
      publication.id,
      new Date(now.getTime() - DAY_MS)
    )
    await analyticsRepository(env.db).upsertPublicationDaily(publication.id, [
      {
        day: "2026-10-01",
        views: 3,
        estimatedMinutesWatched: 0,
        likes: 0,
        subscribersGained: 0,
      },
    ])

    await sweepStaleYouTubeData(env.db, now)

    const history = await statsRepository(env.db).history(publication.id)
    expect(history.map((row) => row.id)).toEqual([fresh.id])
    expect(history.map((row) => row.id)).not.toContain(old.id)
    expect(
      await analyticsRepository(env.db).earlyDaily(channel.id)
    ).toHaveLength(1)
  })

  it("blanks an imported title not refreshed in 30 days", async () => {
    const channel = await seed()
    const now = new Date()
    const repo = publishingRepository(env.db)
    const stale = await insertImportedPublication(env.db, channel.id, {
      createdAt: new Date(now.getTime() - 40 * DAY_MS),
    })
    await snapshot(stale.id, new Date(now.getTime() - 31 * DAY_MS))
    const refreshed = await insertImportedPublication(env.db, channel.id, {
      createdAt: new Date(now.getTime() - 40 * DAY_MS),
    })
    await snapshot(refreshed.id, new Date(now.getTime() - 2 * DAY_MS))
    const justImported = await insertImportedPublication(env.db, channel.id)
    const nimbus = await repo.createPublication({
      clipId: null,
      channelId: channel.id,
      metadata: {
        title: "Mine",
        description: "",
        tags: [],
        privacy: "public",
        publishAt: null,
      },
      status: "published",
      videoId: "n1",
      publishedAt: new Date(now.getTime() - 60 * DAY_MS),
      createdAt: new Date(now.getTime() - 60 * DAY_MS),
    })

    await sweepStaleYouTubeData(env.db, now)

    expect((await repo.getPublication(stale.id))!.metadata).toMatchObject({
      title: "",
      privacy: "public",
    })
    expect((await repo.getPublication(refreshed.id))!.metadata.title).toBe(
      "Imported Short"
    )
    expect((await repo.getPublication(justImported.id))!.metadata.title).toBe(
      "Imported Short"
    )
    expect((await repo.getPublication(nimbus.id))!.metadata.title).toBe("Mine")
  })
})
