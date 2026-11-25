import "server-only"

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import {
  channelDaily,
  channelTopVideos,
  publications,
  youtubeChannels,
  youtubeQuotaUsage,
} from "@/lib/db/schema"

import {
  ACTIVE_PUBLICATION_STATUSES,
  type ChannelStatus,
  type QuotaKind,
} from "./schema"

export type YouTubeChannel = typeof youtubeChannels.$inferSelect
export type NewYouTubeChannel = Omit<
  typeof youtubeChannels.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type Publication = typeof publications.$inferSelect
export type NewPublication = Omit<
  typeof publications.$inferInsert,
  "id" | "updatedAt"
>
export type PublicationPatch = Partial<
  Omit<Publication, "id" | "clipId" | "channelId" | "createdAt">
>

const ACTIVE = [...ACTIVE_PUBLICATION_STATUSES]

export function publishingRepository(db: Db) {
  return {
    async getChannel(workspaceId: string): Promise<YouTubeChannel | undefined> {
      const [row] = await db
        .select()
        .from(youtubeChannels)
        .where(eq(youtubeChannels.workspaceId, workspaceId))
      // Unlinking Google nulls accountId; the channel stays until reconnected.
      if (row && !row.accountId) return { ...row, status: "needs_reconnect" }
      return row
    },

    async getChannelById(id: string): Promise<YouTubeChannel | undefined> {
      const [row] = await db
        .select()
        .from(youtubeChannels)
        .where(eq(youtubeChannels.id, id))
      return row
    },

    upsertChannel(input: NewYouTubeChannel): Promise<YouTubeChannel> {
      return withTransaction(db, async (tx) => {
        const [previous] = await tx
          .select()
          .from(youtubeChannels)
          .where(eq(youtubeChannels.workspaceId, input.workspaceId))
          .for("update")
        const switched = previous && previous.channelId !== input.channelId
        if (switched) {
          await tx
            .delete(publications)
            .where(
              and(
                eq(publications.channelId, previous.id),
                eq(publications.origin, "imported")
              )
            )
          await tx
            .delete(channelDaily)
            .where(eq(channelDaily.channelId, previous.id))
          await tx
            .delete(channelTopVideos)
            .where(eq(channelTopVideos.channelId, previous.id))
        }
        const [row] = await tx
          .insert(youtubeChannels)
          .values({ ...input, id: newId() })
          .onConflictDoUpdate({
            target: youtubeChannels.workspaceId,
            set: {
              accountId: input.accountId,
              channelId: input.channelId,
              title: input.title,
              thumbnailUrl: input.thumbnailUrl ?? null,
              status: input.status ?? "ok",
              ...(switched && {
                uploadsSyncedAt: null,
                analyticsSyncedAt: null,
              }),
              updatedAt: now(),
            },
          })
          .returning()
        return row!
      })
    },

    async setChannelStatus(id: string, status: ChannelStatus) {
      await db
        .update(youtubeChannels)
        .set({ status, updatedAt: now() })
        .where(eq(youtubeChannels.id, id))
    },

    async createPublication(input: NewPublication): Promise<Publication> {
      const [row] = await db
        .insert(publications)
        .values({ ...input, id: newId() })
        .returning()
      return row!
    },

    async getPublication(id: string): Promise<Publication | undefined> {
      const [row] = await db
        .select()
        .from(publications)
        .where(eq(publications.id, id))
      return row
    },

    async getPublications(ids: string[]): Promise<Publication[]> {
      if (ids.length === 0) return []
      return db.select().from(publications).where(inArray(publications.id, ids))
    },

    async updatePublication(
      id: string,
      patch: PublicationPatch
    ): Promise<Publication> {
      const [row] = await db
        .update(publications)
        .set({ ...patch, updatedAt: now() })
        .where(eq(publications.id, id))
        .returning()
      return row!
    },

    publishUploaded(
      publication: Pick<Publication, "id" | "channelId">,
      patch: PublicationPatch & { videoId: string }
    ): Promise<Publication> {
      return withTransaction(db, async (tx) => {
        if (publication.channelId) {
          await tx
            .delete(publications)
            .where(
              and(
                eq(publications.channelId, publication.channelId),
                eq(publications.origin, "imported"),
                eq(publications.videoId, patch.videoId)
              )
            )
        }
        const [row] = await tx
          .update(publications)
          .set({ ...patch, updatedAt: now() })
          .where(eq(publications.id, publication.id))
          .returning()
        return row!
      })
    },

    async latestForClips(clipIds: string[]): Promise<Map<string, Publication>> {
      if (clipIds.length === 0) return new Map()
      const rows = await db
        .select()
        .from(publications)
        .where(inArray(publications.clipId, clipIds))
        .orderBy(desc(publications.createdAt))
      const latest = new Map<string, Publication>()
      for (const row of rows) {
        if (row.clipId && !latest.has(row.clipId)) latest.set(row.clipId, row)
      }
      return latest
    },

    async activeForClip(clipId: string): Promise<Publication | undefined> {
      const [row] = await db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.clipId, clipId),
            inArray(publications.status, ACTIVE)
          )
        )
        .orderBy(desc(publications.createdAt))
        .limit(1)
      return row
    },

    async assetInActiveUse(assetId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.renderAssetId, assetId),
            inArray(publications.status, ACTIVE)
          )
        )
        .limit(1)
      return row !== undefined
    },

    async countPublished(channelId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(publications)
        .where(
          and(
            eq(publications.channelId, channelId),
            eq(publications.origin, "nimbus"),
            eq(publications.status, "published")
          )
        )
      return row?.count ?? 0
    },

    async countCreatedOnDay(workspaceId: string, day: string) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(publications)
        .innerJoin(
          youtubeChannels,
          eq(youtubeChannels.id, publications.channelId)
        )
        .where(
          and(
            eq(youtubeChannels.workspaceId, workspaceId),
            eq(publications.origin, "nimbus"),
            ne(publications.status, "failed"),
            sql`(${publications.createdAt} at time zone 'America/Los_Angeles')::date = ${day}::date`
          )
        )
      return row?.count ?? 0
    },

    spendQuota(input: {
      day: string
      workspaceId: string | null
      kind: QuotaKind
      units: number
      budget: number
    }): Promise<boolean> {
      const bucket: QuotaKind[] =
        input.kind === "upload" ? ["upload"] : ["list", "stats", "import"]
      return withTransaction(db, async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`youtube-quota:${input.day}:${bucket[0]}`}))`
        )
        const [row] = await tx
          .select({
            total: sql<number>`coalesce(sum(${youtubeQuotaUsage.units}), 0)::int`,
          })
          .from(youtubeQuotaUsage)
          .where(
            and(
              eq(youtubeQuotaUsage.day, input.day),
              inArray(youtubeQuotaUsage.kind, bucket)
            )
          )
        if ((row?.total ?? 0) + input.units > input.budget) return false
        await tx.insert(youtubeQuotaUsage).values({
          id: newId(),
          day: input.day,
          workspaceId: input.workspaceId,
          kind: input.kind,
          units: input.units,
        })
        return true
      })
    },
  }
}
