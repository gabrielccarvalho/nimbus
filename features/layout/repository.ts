import "server-only"

import { and, eq } from "drizzle-orm"

import { newId, now, type Db } from "@/lib/db"
import { layoutPresets, layouts } from "@/lib/db/schema"

import type { SourceAspect } from "../projects/schema"
import type { LayoutInput } from "./schema"

export type Layout = typeof layouts.$inferSelect
export type LayoutPreset = typeof layoutPresets.$inferSelect

export function layoutRepository(db: Db) {
  return {
    get(projectId: string): Layout | undefined {
      return db
        .select()
        .from(layouts)
        .where(eq(layouts.projectId, projectId))
        .get()
    },

    upsert(
      projectId: string,
      input: LayoutInput & {
        sourceAspect: SourceAspect
        confidence?: number
        confirmedByUser?: boolean
      }
    ): Layout {
      const values = {
        sourceAspect: input.sourceAspect,
        webcamRect: input.webcamRect,
        gameplayRect: input.gameplayRect,
        gameplayFocusX: input.gameplayFocusX,
        mode: input.mode,
        confidence: input.confidence ?? 0,
        confirmedByUser: input.confirmedByUser ?? false,
      }
      return db
        .insert(layouts)
        .values({ projectId, ...values })
        .onConflictDoUpdate({
          target: layouts.projectId,
          set: { ...values, updatedAt: now() },
        })
        .returning()
        .get()
    },

    findPreset(width: number, height: number): LayoutPreset | undefined {
      return db
        .select()
        .from(layoutPresets)
        .where(
          and(eq(layoutPresets.width, width), eq(layoutPresets.height, height))
        )
        .get()
    },

    savePreset(width: number, height: number, input: LayoutInput) {
      const values = {
        webcamRect: input.webcamRect,
        gameplayRect: input.gameplayRect,
        gameplayFocusX: input.gameplayFocusX,
        mode: input.mode,
      }
      return db
        .insert(layoutPresets)
        .values({ id: newId(), width, height, ...values })
        .onConflictDoUpdate({
          target: [layoutPresets.width, layoutPresets.height],
          set: { ...values, updatedAt: now() },
        })
        .returning()
        .get()
    },

    listPresets(): LayoutPreset[] {
      return db.select().from(layoutPresets).all()
    },

    deletePreset(id: string) {
      db.delete(layoutPresets).where(eq(layoutPresets.id, id)).run()
    },
  }
}
