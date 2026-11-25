import "server-only"

import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm"

import { newId, withTransaction, type Db } from "@/lib/db"
import {
  channelDaily,
  channelTopVideos,
  clips,
  jobs,
  publicationDaily,
  publications,
  youtubeChannels,
} from "@/lib/db/schema"

import type { Clip } from "../clips/repository"
import type { Job } from "../jobs/queue"
import type { Publication, YouTubeChannel } from "../publishing/repository"
import type {
  AnalyticsPeriod,
  ChannelDay,
  ChannelJobType,
  DailyViews,
  ImportedShort,
} from "./schema"

export function analyticsRepository(db: Db) {
  return {
    async upsertPublicationDaily(
      publicationId: string,
      rows: DailyViews[]
    ): Promise<void> {
      if (rows.length === 0) return
      await db
        .insert(publicationDaily)
        .values(rows.map((row) => ({ ...row, publicationId })))
        .onConflictDoUpdate({
          target: [publicationDaily.publicationId, publicationDaily.day],
          set: {
            views: sql`excluded.views`,
            estimatedMinutesWatched: sql`excluded.estimated_minutes_watched`,
            likes: sql`excluded.likes`,
            subscribersGained: sql`excluded.subscribers_gained`,
          },
        })
    },

    async lastPublicationDay(publicationId: string): Promise<string | null> {
      const [row] = await db
        .select({ day: sql<string | null>`max(${publicationDaily.day})` })
        .from(publicationDaily)
        .where(eq(publicationDaily.publicationId, publicationId))
      return row?.day ?? null
    },

    earlyDaily(
      channelId: string
    ): Promise<{ publicationId: string; day: string; views: number }[]> {
      return db
        .select({
          publicationId: publicationDaily.publicationId,
          day: publicationDaily.day,
          views: publicationDaily.views,
        })
        .from(publicationDaily)
        .innerJoin(
          publications,
          eq(publications.id, publicationDaily.publicationId)
        )
        .where(
          and(
            eq(publications.channelId, channelId),
            eq(publications.status, "published"),
            sql`${publicationDaily.day} <= (${publications.publishedAt} at time zone 'America/Los_Angeles')::date + 28`
          )
        )
        .orderBy(asc(publicationDaily.publicationId), asc(publicationDaily.day))
    },

    async publicationDataThrough(channelId: string): Promise<string | null> {
      const [row] = await db
        .select({ day: sql<string | null>`max(${publicationDaily.day})` })
        .from(publicationDaily)
        .innerJoin(
          publications,
          eq(publications.id, publicationDaily.publicationId)
        )
        .where(eq(publications.channelId, channelId))
      return row?.day ?? null
    },

    replaceChannelDays(
      channelId: string,
      from: string,
      to: string,
      rows: ChannelDay[]
    ): Promise<void> {
      return withTransaction(db, async (tx) => {
        await tx
          .delete(channelDaily)
          .where(
            and(
              eq(channelDaily.channelId, channelId),
              between(channelDaily.day, from, to)
            )
          )
        if (rows.length === 0) return
        await tx
          .insert(channelDaily)
          .values(rows.map((row) => ({ ...row, channelId })))
      })
    },

    async lastChannelDay(channelId: string): Promise<string | null> {
      const [row] = await db
        .select({ day: sql<string | null>`max(${channelDaily.day})` })
        .from(channelDaily)
        .where(eq(channelDaily.channelId, channelId))
      return row?.day ?? null
    },

    channelDays(
      channelId: string,
      from: string,
      to: string
    ): Promise<ChannelDay[]> {
      return db
        .select({
          day: channelDaily.day,
          contentType: channelDaily.contentType,
          views: channelDaily.views,
          estimatedMinutesWatched: channelDaily.estimatedMinutesWatched,
          averageViewDurationS: channelDaily.averageViewDurationS,
          likes: channelDaily.likes,
          comments: channelDaily.comments,
          shares: channelDaily.shares,
          subscribersGained: channelDaily.subscribersGained,
          subscribersLost: channelDaily.subscribersLost,
        })
        .from(channelDaily)
        .where(
          and(
            eq(channelDaily.channelId, channelId),
            between(channelDaily.day, from, to)
          )
        )
        .orderBy(asc(channelDaily.day), asc(channelDaily.contentType))
    },

    publishedSince(channelId: string, since: Date): Promise<Publication[]> {
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.channelId, channelId),
            eq(publications.status, "published"),
            isNotNull(publications.videoId),
            gte(publications.publishedAt, since)
          )
        )
    },

    replaceTopVideos(
      channelId: string,
      period: AnalyticsPeriod,
      through: string,
      rows: { videoId: string; views: number }[]
    ): Promise<void> {
      return withTransaction(db, async (tx) => {
        await tx
          .delete(channelTopVideos)
          .where(
            and(
              eq(channelTopVideos.channelId, channelId),
              eq(channelTopVideos.period, period)
            )
          )
        if (rows.length === 0) return
        await tx
          .insert(channelTopVideos)
          .values(rows.map((row) => ({ ...row, channelId, period, through })))
          .onConflictDoNothing()
      })
    },

    topPublications(
      channelId: string,
      period: AnalyticsPeriod,
      limit: number
    ): Promise<
      { publication: Publication; clip: Clip | null; views: number }[]
    > {
      return db
        .select({
          publication: publications,
          clip: clips,
          views: channelTopVideos.views,
        })
        .from(channelTopVideos)
        .innerJoin(
          publications,
          and(
            eq(publications.channelId, channelTopVideos.channelId),
            eq(publications.videoId, channelTopVideos.videoId)
          )
        )
        .leftJoin(clips, eq(clips.id, publications.clipId))
        .where(
          and(
            eq(channelTopVideos.channelId, channelId),
            eq(channelTopVideos.period, period),
            eq(publications.status, "published")
          )
        )
        .orderBy(desc(channelTopVideos.views), asc(channelTopVideos.videoId))
        .limit(limit)
    },

    async knownVideoIds(channelId: string): Promise<Set<string>> {
      const rows = await db
        .select({ videoId: publications.videoId })
        .from(publications)
        .where(
          and(
            eq(publications.channelId, channelId),
            isNotNull(publications.videoId)
          )
        )
      return new Set(rows.map((row) => row.videoId!))
    },

    async insertImported(
      channelId: string,
      videos: ImportedShort[]
    ): Promise<Publication[]> {
      if (videos.length === 0) return []
      const taken = await db
        .select({ videoId: publications.videoId })
        .from(publications)
        .where(
          and(
            eq(publications.channelId, channelId),
            eq(publications.origin, "nimbus"),
            inArray(
              publications.videoId,
              videos.map((video) => video.videoId)
            )
          )
        )
      const nimbus = new Set(taken.map((row) => row.videoId))
      const fresh = videos.filter((video) => !nimbus.has(video.videoId))
      if (fresh.length === 0) return []
      return db
        .insert(publications)
        .values(
          fresh.map((video) => ({
            id: newId(),
            clipId: null,
            channelId,
            origin: "imported" as const,
            metadata: {
              title: video.title,
              description: "",
              tags: [],
              privacy: video.privacy,
              publishAt: null,
            },
            status: "published" as const,
            videoId: video.videoId,
            url: `https://youtube.com/shorts/${video.videoId}`,
            publishedAt: video.publishedAt,
            durationMs: video.durationMs,
          }))
        )
        .onConflictDoNothing()
        .returning()
    },

    async lockChannelJob(
      type: ChannelJobType,
      channelId: string
    ): Promise<void> {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${type}:${channelId}`}))`
      )
    },

    async channelJobActive(
      type: ChannelJobType,
      channelId: string
    ): Promise<boolean> {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, type),
            inArray(jobs.status, ["queued", "running"]),
            sql`${jobs.payload}->>'channelId' = ${channelId}`
          )
        )
        .limit(1)
      return row !== undefined
    },

    async latestChannelJob(
      type: ChannelJobType,
      channelId: string
    ): Promise<Job | undefined> {
      const [row] = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.type, type),
            sql`${jobs.payload}->>'channelId' = ${channelId}`
          )
        )
        .orderBy(desc(jobs.createdAt))
        .limit(1)
      return row
    },

    async markSynced(
      channelId: string,
      field: "uploadsSyncedAt" | "analyticsSyncedAt",
      at: Date
    ): Promise<void> {
      await db
        .update(youtubeChannels)
        .set({ [field]: at })
        .where(eq(youtubeChannels.id, channelId))
    },

    dueChannels(): Promise<YouTubeChannel[]> {
      return db
        .select()
        .from(youtubeChannels)
        .where(
          and(
            eq(youtubeChannels.status, "ok"),
            isNotNull(youtubeChannels.accountId)
          )
        )
    },
  }
}
