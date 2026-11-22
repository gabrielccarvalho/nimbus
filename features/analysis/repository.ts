import "server-only"

import { eq } from "drizzle-orm"

import { now, type Db } from "@/lib/db"
import { signals } from "@/lib/db/schema"

import type { SignalsData } from "./schema"

export type Signals = typeof signals.$inferSelect

export function signalsRepository(db: Db) {
  return {
    get(projectId: string): Signals | undefined {
      return db
        .select()
        .from(signals)
        .where(eq(signals.projectId, projectId))
        .get()
    },

    save(projectId: string, data: SignalsData) {
      db.insert(signals)
        .values({ projectId, ...data })
        .onConflictDoUpdate({
          target: signals.projectId,
          set: { ...data, updatedAt: now() },
        })
        .run()
    },
  }
}
