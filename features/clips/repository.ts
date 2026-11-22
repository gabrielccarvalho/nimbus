import "server-only"

import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { newId, now, type Db } from "@/lib/db"
import { clips } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import type { ClipStatus } from "./schema"

export type Clip = typeof clips.$inferSelect
export type NewClip = Omit<typeof clips.$inferInsert, "id" | "projectId">

export function clipRepository(db: Db) {
  function get(id: string): Clip | undefined {
    return db.select().from(clips).where(eq(clips.id, id)).get()
  }

  return {
    get,

    getOrThrow(id: string): Clip {
      const clip = get(id)
      if (!clip) throw new AppError("NOT_FOUND", "Clip not found")
      return clip
    },

    listForProject(projectId: string): Clip[] {
      return db
        .select()
        .from(clips)
        .where(eq(clips.projectId, projectId))
        .orderBy(desc(clips.score), asc(clips.startMs))
        .all()
    },

    listByStatus(projectId: string, statuses: ClipStatus[]): Clip[] {
      return db
        .select()
        .from(clips)
        .where(
          and(eq(clips.projectId, projectId), inArray(clips.status, statuses))
        )
        .orderBy(asc(clips.startMs))
        .all()
    },

    replaceCandidates(projectId: string, candidates: NewClip[]): Clip[] {
      return db.transaction((tx) => {
        tx.delete(clips)
          .where(
            and(
              eq(clips.projectId, projectId),
              inArray(clips.status, ["candidate", "rejected"])
            )
          )
          .run()
        if (candidates.length === 0) return []
        return tx
          .insert(clips)
          .values(candidates.map((c) => ({ ...c, id: newId(), projectId })))
          .returning()
          .all()
      })
    },

    update(
      id: string,
      patch: Partial<Omit<typeof clips.$inferInsert, "id" | "projectId">>
    ): Clip {
      const updated = db
        .update(clips)
        .set({ ...patch, updatedAt: now() })
        .where(eq(clips.id, id))
        .returning()
        .get()
      if (!updated) throw new AppError("NOT_FOUND", "Clip not found")
      return updated
    },

    setStatus(ids: string[], status: ClipStatus) {
      if (ids.length === 0) return
      db.update(clips)
        .set({ status, updatedAt: now() })
        .where(inArray(clips.id, ids))
        .run()
    },
  }
}
