import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { transcripts } from "@/lib/db/schema"

import type { TranscriptData } from "./schema"

export type Transcript = typeof transcripts.$inferSelect

export function transcriptRepository(db: Db) {
  return {
    get(projectId: string): Transcript | undefined {
      return db
        .select()
        .from(transcripts)
        .where(eq(transcripts.projectId, projectId))
        .get()
    },

    save(projectId: string, data: TranscriptData) {
      db.insert(transcripts)
        .values({ projectId, ...data })
        .onConflictDoUpdate({
          target: transcripts.projectId,
          set: { ...data, updatedAt: now() },
        })
        .run()
    },
  }
}
