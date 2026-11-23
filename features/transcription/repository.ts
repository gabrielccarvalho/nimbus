import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { transcripts } from "@/lib/db/schema"

import type { TranscriptData } from "./schema"

export type Transcript = typeof transcripts.$inferSelect

export function transcriptRepository(db: Db) {
  return {
    async get(projectId: string): Promise<Transcript | undefined> {
      const [row] = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.projectId, projectId))
      return row
    },

    async save(projectId: string, data: TranscriptData) {
      await db
        .insert(transcripts)
        .values({ projectId, ...data })
        .onConflictDoUpdate({
          target: transcripts.projectId,
          set: { ...data, updatedAt: now() },
        })
    },
  }
}
