import "server-only"

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { newId, type Db } from "@/lib/db"
import { clips, jobs, publicationStats, publications } from "@/lib/db/schema"

import type { Clip } from "../clips/repository"
import type { Publication } from "./repository"

export type Snapshot = typeof publicationStats.$inferSelect
export type NewSnapshot = Omit<
  typeof publicationStats.$inferInsert,
  "id" | "fetchedAt"
> & { fetchedAt?: Date }

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
        .where(
          and(
            eq(publications.status, "published"),
            isNotNull(publications.videoId)
          )
        )
      return rows.map((row) => ({
        publication: row.publication,
        lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt) : null,
      }))
    },

    async syncActive(publicationId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, "sync_stats"),
            inArray(jobs.status, ["queued", "running"]),
            sql`${jobs.payload}->>'publicationId' = ${publicationId}`
          )
        )
        .limit(1)
      return row !== undefined
    },

    async forChannel(channelId: string): Promise<
      {
        publication: Publication
        clip: Clip
        projectId: string
        latest: Snapshot | null
      }[]
    > {
      const rows = await db
        .select({ publication: publications, clip: clips })
        .from(publications)
        .innerJoin(clips, eq(clips.id, publications.clipId))
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
        projectId: clip.projectId,
        latest: latest.get(publication.id) ?? null,
      }))
    },
  }
}
