import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { clips, musicTracks, projects } from "@/lib/db/schema"

export type MusicTrack = typeof musicTracks.$inferSelect
export type NewMusicTrack = typeof musicTracks.$inferInsert

const usesTrack = (trackId: string) =>
  sql`coalesce(${clips.audioMix}->'music', '[]'::jsonb) @> ${JSON.stringify([{ trackId }])}::jsonb`
const musicOf = sql<
  { trackId: string }[]
>`coalesce(${clips.audioMix}->'music', '[]'::jsonb)`

export function musicRepository(db: Db) {
  return {
    async create(
      track: Omit<NewMusicTrack, "id"> & { id: string }
    ): Promise<MusicTrack> {
      const [row] = await db.insert(musicTracks).values(track).returning()
      return row!
    },

    async get(id: string): Promise<MusicTrack | undefined> {
      const [row] = await db
        .select()
        .from(musicTracks)
        .where(eq(musicTracks.id, id))
      return row
    },

    listForWorkspace(workspaceId: string): Promise<MusicTrack[]> {
      return db
        .select()
        .from(musicTracks)
        .where(eq(musicTracks.workspaceId, workspaceId))
        .orderBy(desc(musicTracks.createdAt), desc(musicTracks.id))
    },

    async lock(
      id: string,
      mode: "update" | "share"
    ): Promise<MusicTrack | undefined> {
      const [row] = await db
        .select()
        .from(musicTracks)
        .where(eq(musicTracks.id, id))
        .for(mode)
      return row
    },

    async rename(id: string, title: string) {
      await db
        .update(musicTracks)
        .set({ title, updatedAt: now() })
        .where(eq(musicTracks.id, id))
    },

    async update(
      id: string,
      patch: Partial<
        Pick<NewMusicTrack, "status" | "durationMs" | "peaks" | "error">
      >
    ) {
      await db
        .update(musicTracks)
        .set({ ...patch, updatedAt: now() })
        .where(eq(musicTracks.id, id))
    },

    async delete(id: string) {
      await db.delete(musicTracks).where(eq(musicTracks.id, id))
    },

    clipsUsing(
      trackId: string
    ): Promise<{ clipId: string; title: string; projectId: string }[]> {
      return db
        .select({
          clipId: clips.id,
          title: clips.title,
          projectId: clips.projectId,
        })
        .from(clips)
        .where(usesTrack(trackId))
        .orderBy(clips.createdAt, clips.id)
    },

    async usageCounts(workspaceId: string) {
      const rows = await db
        .select({ music: musicOf })
        .from(clips)
        .innerJoin(projects, eq(projects.id, clips.projectId))
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            sql`jsonb_array_length(${musicOf}) > 0`
          )
        )
      const counts = new Map<string, number>()
      for (const row of rows) {
        for (const trackId of new Set(row.music.map((m) => m.trackId))) {
          counts.set(trackId, (counts.get(trackId) ?? 0) + 1)
        }
      }
      return counts
    },
  }
}
