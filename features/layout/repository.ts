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
    async get(projectId: string): Promise<Layout | undefined> {
      const [row] = await db
        .select()
        .from(layouts)
        .where(eq(layouts.projectId, projectId))
      return row
    },

    async upsert(
      projectId: string,
      input: LayoutInput & {
        sourceAspect: SourceAspect
        confidence?: number
        confirmedByUser?: boolean
      }
    ): Promise<Layout> {
      const values = {
        sourceAspect: input.sourceAspect,
        webcamRect: input.webcamRect,
        gameplayRect: input.gameplayRect,
        gameplayFocusX: input.gameplayFocusX,
        mode: input.mode,
        confidence: input.confidence ?? 0,
        confirmedByUser: input.confirmedByUser ?? false,
      }
      const [row] = await db
        .insert(layouts)
        .values({ projectId, ...values })
        .onConflictDoUpdate({
          target: layouts.projectId,
          set: { ...values, updatedAt: now() },
        })
        .returning()
      return row!
    },

    async findPreset(
      width: number,
      height: number
    ): Promise<LayoutPreset | undefined> {
      const [row] = await db
        .select()
        .from(layoutPresets)
        .where(
          and(eq(layoutPresets.width, width), eq(layoutPresets.height, height))
        )
      return row
    },

    async savePreset(
      width: number,
      height: number,
      input: LayoutInput
    ): Promise<LayoutPreset> {
      const values = {
        webcamRect: input.webcamRect,
        gameplayRect: input.gameplayRect,
        gameplayFocusX: input.gameplayFocusX,
        mode: input.mode,
      }
      const [row] = await db
        .insert(layoutPresets)
        .values({ id: newId(), width, height, ...values })
        .onConflictDoUpdate({
          target: [layoutPresets.width, layoutPresets.height],
          set: { ...values, updatedAt: now() },
        })
        .returning()
      return row!
    },

    listPresets(): Promise<LayoutPreset[]> {
      return db.select().from(layoutPresets)
    },

    async deletePreset(id: string) {
      await db.delete(layoutPresets).where(eq(layoutPresets.id, id))
    },
  }
}
