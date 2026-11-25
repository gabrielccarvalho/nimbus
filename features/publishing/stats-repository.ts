import "server-only"

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"

import { newId, now, type Db } from "@/lib/db"
import {
  clips,
  jobs,
  publicationStats,
  publications,
  youtubeChannels,
} from "@/lib/db/schema"

import type { Clip } from "../clips/repository"
import type { Publication } from "./repository"

export type Snapshot = typeof publicationStats.$inferSelect
export type NewSnapshot = Omit<
  typeof publicationStats.$inferInsert,
  "id" | "fetchedAt"
> & { fetchedAt?: Date }

export type ChannelPublication = {
  publication: Publication
  clip: Clip | null
  projectId: string | null
  latest: Snapshot | null
}

export function statsRepository(db: Db) {
  return {
    async add(input: NewSnapshot): Promise<Snapshot> {
      const [row] = await db
        .insert(publicationStats)
        .values({ ...input, id: newId() })
        .returning()
      return row!
    },

    async latestFor(publicationIds: string[]): Promise<Map<string, Snapshot>> {
      if (publicationIds.length === 0) return new Map()
      const rows = await db
        .select()
        .from(publicationStats)
        .where(inArray(publicationStats.publicationId, publicationIds))
        .orderBy(desc(publicationStats.fetchedAt))
      const latest = new Map<string, Snapshot>()
      for (const row of rows) {
        if (!latest.has(row.publicationId)) latest.set(row.publicationId, row)
      }
      return latest
    },

    history(publicationId: string): Promise<Snapshot[]> {
      return db
        .select()
        .from(publicationStats)
        .where(eq(publicationStats.publicationId, publicationId))
        .orderBy(asc(publicationStats.fetchedAt))
    },

    async dueCandidates(): Promise<
      { publication: Publication; lastFetchedAt: Date | null }[]
    > {
      const rows = await db
        .select({
          publication: publications,
          lastFetchedAt: sql<
            string | null
          >`(select max(s.fetched_at) from publication_stats s where s.publication_id = publications.id)`,
        })
        .from(publications)
        .innerJoin(
          youtubeChannels,
          eq(youtubeChannels.id, publications.channelId)
        )
        .where(
          and(
            eq(publications.status, "published"),
            isNotNull(publications.videoId),
            eq(youtubeChannels.status, "ok"),
            isNotNull(youtubeChannels.accountId)
          )
        )
      return rows.map((row) => ({
        publication: row.publication,
        lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt) : null,
      }))
    },

    async syncActive(
      publicationId: string,
      options: { dueBy?: Date } = {}
    ): Promise<boolean> {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            inArray(jobs.type, ["sync_stats", "sync_stats_batch"]),
            inArray(jobs.status, ["queued", "running"]),
            or(
              sql`${jobs.payload}->>'publicationId' = ${publicationId}`,
              sql`${jobs.payload}->'publicationIds' @> jsonb_build_array(${publicationId}::text)`
            ),
            options.dueBy
              ? or(
                  eq(jobs.status, "running"),
                  lte(jobs.runAfter, options.dueBy)
                )
              : undefined
          )
        )
        .limit(1)
      return row !== undefined
    },

    async activeSyncIds(): Promise<Set<string>> {
      const rows = await db
        .select({ payload: jobs.payload })
        .from(jobs)
        .where(
          and(
            inArray(jobs.type, ["sync_stats", "sync_stats_batch"]),
            inArray(jobs.status, ["queued", "running"])
          )
        )
      return new Set(
        rows.flatMap(({ payload }) =>
          Array.isArray(payload.publicationIds)
            ? (payload.publicationIds as string[])
            : typeof payload.publicationId === "string"
              ? [payload.publicationId]
              : []
        )
      )
    },

    async deleteSnapshotsBefore(cutoff: Date): Promise<number> {
      const rows = await db
        .delete(publicationStats)
        .where(lt(publicationStats.fetchedAt, cutoff))
        .returning({ id: publicationStats.id })
      return rows.length
    },

    async blankStaleImportedTitles(cutoff: Date): Promise<number> {
      const rows = await db
        .update(publications)
        .set({
          metadata: sql`jsonb_set(${publications.metadata}, '{title}', '""')`,
          updatedAt: now(),
        })
        .where(
          and(
            eq(publications.origin, "imported"),
            lt(publications.createdAt, cutoff),
            sql`${publications.metadata}->>'title' <> ''`,
            sql`not exists (select 1 from publication_stats s where s.publication_id = ${publications.id} and s.fetched_at >= ${cutoff.toISOString()}::timestamptz)`
          )
        )
        .returning({ id: publications.id })
      return rows.length
    },

    async lockSync(publicationId: string): Promise<void> {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sync-stats:${publicationId}`}))`
      )
    },

    async forChannel(channelId: string): Promise<ChannelPublication[]> {
      const rows = await db
        .select({ publication: publications, clip: clips })
        .from(publications)
        .leftJoin(clips, eq(clips.id, publications.clipId))
        .where(
          and(
            eq(publications.channelId, channelId),
            eq(publications.status, "published")
          )
        )
        .orderBy(desc(publications.publishedAt), desc(publications.createdAt))
      const latest = await this.latestFor(rows.map((r) => r.publication.id))
      return rows.map(({ publication, clip }) => ({
        publication,
        clip,
        projectId: clip?.projectId ?? null,
        latest: latest.get(publication.id) ?? null,
      }))
    },
  }
}
