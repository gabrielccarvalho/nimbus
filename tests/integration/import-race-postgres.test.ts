import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { analyticsRepository } from "@/features/analytics/repository"
import { clipRepository } from "@/features/clips/repository"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { publishingRepository } from "@/features/publishing/repository"
import { withTransaction } from "@/lib/db"
import { account, publications, user, workspaces } from "@/lib/db/schema"

import {
  connect,
  dropDatabase,
  postgresReachable,
  recreateDatabase,
} from "../utils/postgres"

const NAME = `nimbus_race_${process.pid}`
const reachable = await postgresReachable()

describe.runIf(reachable)("import and publish on Postgres", () => {
  let url: string

  beforeAll(async () => {
    url = await recreateDatabase(NAME)
  }, 30_000)

  afterAll(async () => {
    await dropDatabase(NAME)
  })

  it("a publish waiting on a running import removes the row it imported", async () => {
    const { db, pool } = connect(url)
    try {
      const userId = crypto.randomUUID()
      const accountId = crypto.randomUUID()
      await db
        .insert(user)
        .values({ id: userId, name: "A", email: `${userId}@example.com` })
      await db.insert(account).values({
        id: accountId,
        accountId: "g-1",
        providerId: "google",
        userId,
      })
      const workspaceId = crypto.randomUUID()
      await db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
      const repo = publishingRepository(db)
      const channel = await repo.upsertChannel({
        workspaceId,
        accountId,
        channelId: "UC1",
        title: "Channel",
      })
      const project = await projectRepository(db).create({
        workspaceId,
        name: "Stream",
        settings: defaultProjectSettings,
      })
      const [clip] = await clipRepository(db).replaceCandidates(project.id, [
        { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
      ])
      const publication = await repo.createPublication({
        clipId: clip!.id,
        channelId: channel.id,
        metadata: {
          title: "Clutch",
          description: "",
          tags: [],
          privacy: "public",
          publishAt: null,
        },
        status: "uploading",
      })

      let publishing: Promise<unknown> | undefined
      await withTransaction(db, async (tx) => {
        const imports = analyticsRepository(tx)
        await imports.lockChannelJob("sync_uploads", channel.id)
        await imports.insertImported(channel.id, [
          {
            videoId: "v1",
            title: "Clutch",
            publishedAt: new Date(),
            durationMs: 20_000,
            privacy: "public",
          },
        ])
        publishing = repo.publishUploaded(publication, {
          status: "published",
          videoId: "v1",
        })
        await new Promise((resolve) => setTimeout(resolve, 300))
      })
      await publishing

      const rows = await db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.channelId, channel.id),
            eq(publications.videoId, "v1")
          )
        )
      expect(rows.map((row) => row.origin)).toEqual(["nimbus"])
    } finally {
      await pool.end()
    }
  }, 30_000)
})
