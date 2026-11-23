import "server-only"

import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import { clips } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import type { ClipStatus } from "./schema"

export type Clip = typeof clips.$inferSelect
export type NewClip = Omit<typeof clips.$inferInsert, "id" | "projectId">

export function clipRepository(db: Db) {
  async function get(id: string): Promise<Clip | undefined> {
    const [row] = await db.select().from(clips).where(eq(clips.id, id))
    return row
  }

  return {
    get,

    async getOrThrow(id: string): Promise<Clip> {
      const clip = await get(id)
      if (!clip) throw new AppError("NOT_FOUND", "Clip not found")
      return clip
    },

    listForProject(projectId: string): Promise<Clip[]> {
      return db
        .select()
        .from(clips)
        .where(eq(clips.projectId, projectId))
        .orderBy(desc(clips.score), asc(clips.startMs))
    },

    listByStatus(projectId: string, statuses: ClipStatus[]): Promise<Clip[]> {
      return db
        .select()
        .from(clips)
        .where(
          and(eq(clips.projectId, projectId), inArray(clips.status, statuses))
        )
        .orderBy(asc(clips.startMs))
    },

    replaceCandidates(
      projectId: string,
      candidates: NewClip[]
    ): Promise<Clip[]> {
      return withTransaction(db, async (tx) => {
        await tx
          .delete(clips)
          .where(
            and(
              eq(clips.projectId, projectId),
              inArray(clips.status, ["candidate", "rejected"])
            )
          )
        if (candidates.length === 0) return []
        return tx
          .insert(clips)
          .values(candidates.map((c) => ({ ...c, id: newId(), projectId })))
          .returning()
      })
    },

    async update(
      id: string,
      patch: Partial<Omit<typeof clips.$inferInsert, "id" | "projectId">>
    ): Promise<Clip> {
      const [updated] = await db
        .update(clips)
        .set({ ...patch, updatedAt: now() })
        .where(eq(clips.id, id))
        .returning()
      if (!updated) throw new AppError("NOT_FOUND", "Clip not found")
      return updated
    },

    async setStatus(ids: string[], status: ClipStatus) {
      if (ids.length === 0) return
      await db
        .update(clips)
        .set({ status, updatedAt: now() })
        .where(inArray(clips.id, ids))
    },
  }
}
