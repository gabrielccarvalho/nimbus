import "server-only"

import { and, desc, eq, isNotNull, sql } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { clips, musicTracks, projects } from "@/lib/db/schema"

export type MusicTrack = typeof musicTracks.$inferSelect
export type NewMusicTrack = typeof musicTracks.$inferInsert

const trackIdOf = sql<string>`${clips.audioMix}->>'trackId'`

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
        .where(eq(trackIdOf, trackId))
        .orderBy(clips.createdAt, clips.id)
    },

    async usageCounts(workspaceId: string) {
      const rows = await db
        .select({ trackId: trackIdOf, count: sql<number>`count(*)::int` })
        .from(clips)
        .innerJoin(projects, eq(projects.id, clips.projectId))
        .where(and(eq(projects.workspaceId, workspaceId), isNotNull(trackIdOf)))
        .groupBy(trackIdOf)
      return new Map(rows.map((row) => [row.trackId, row.count]))
    },
  }
}
