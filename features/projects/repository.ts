import "server-only"

import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { newId, now, type Db } from "@/lib/db"
import { assets, clips, projects } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import { assertTransition, isRunning } from "../pipeline/state-machine"
import type { ProjectSettings, ProjectStatus } from "./schema"

export type Project = typeof projects.$inferSelect
export type Asset = typeof assets.$inferSelect
export type NewAsset = Omit<typeof assets.$inferInsert, "id"> & { id?: string }

export type ProjectListItem = Project & {
  clipCount: number
  durationMs: number | null
  thumbnailKey: string | null
}

export function projectRepository(db: Db) {
  function get(id: string): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get()
  }

  function getOrThrow(id: string): Project {
    const project = get(id)
    if (!project) throw new AppError("NOT_FOUND", "Project not found")
    return project
  }

  return {
    get,
    getOrThrow,

    create(input: {
      id?: string
      name: string
      settings: ProjectSettings
    }): Project {
      return db
        .insert(projects)
        .values({
          id: input.id ?? newId(),
          name: input.name,
          status: "uploaded",
          settings: input.settings,
        })
        .returning()
        .get()
    },

    list({ limit = 100 }: { limit?: number } = {}): ProjectListItem[] {
      const rows = db
        .select()
        .from(projects)
        .orderBy(desc(projects.createdAt))
        .limit(limit)
        .all()
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.id)
      const counts = new Map(
        db
          .select({ projectId: clips.projectId, count: sql<number>`count(*)` })
          .from(clips)
          .where(
            and(
              inArray(clips.projectId, ids),
              sql`${clips.status} != 'rejected'`
            )
          )
          .groupBy(clips.projectId)
          .all()
          .map((r) => [r.projectId, r.count])
      )
      const media = db
        .select({
          projectId: assets.projectId,
          kind: assets.kind,
          storageKey: assets.storageKey,
          durationMs: assets.durationMs,
        })
        .from(assets)
        .where(
          and(
            inArray(assets.projectId, ids),
            inArray(assets.kind, ["source", "thumbnail"])
          )
        )
        .all()
      return rows.map((row) => {
        const own = media.filter((m) => m.projectId === row.id)
        return {
          ...row,
          clipCount: counts.get(row.id) ?? 0,
          durationMs: own.find((m) => m.kind === "source")?.durationMs ?? null,
          thumbnailKey:
            own.find((m) => m.kind === "thumbnail")?.storageKey ?? null,
        }
      })
    },

    rename(id: string, name: string) {
      db.update(projects)
        .set({ name, updatedAt: now() })
        .where(eq(projects.id, id))
        .run()
    },

    updateSettings(id: string, settings: ProjectSettings) {
      db.update(projects)
        .set({ settings, updatedAt: now() })
        .where(eq(projects.id, id))
        .run()
    },

    setSourceAsset(id: string, assetId: string) {
      db.update(projects)
        .set({ sourceAssetId: assetId, updatedAt: now() })
        .where(eq(projects.id, id))
        .run()
    },

    setAwaitingManualSelection(id: string, value: boolean) {
      db.update(projects)
        .set({ awaitingManualSelection: value, updatedAt: now() })
        .where(eq(projects.id, id))
        .run()
    },

    transition(id: string, to: ProjectStatus): Project {
      return db.transaction((tx) => {
        const current = tx
          .select()
          .from(projects)
          .where(eq(projects.id, id))
          .get()
        if (!current) throw new AppError("NOT_FOUND", "Project not found")
        assertTransition(current.status, to)
        return tx
          .update(projects)
          .set({
            status: to,
            error: null,
            failedStep: to === "cancelled" ? current.status : null,
            updatedAt: now(),
          })
          .where(eq(projects.id, id))
          .returning()
          .get()
      })
    },

    markFailed(id: string, message: string): Project | undefined {
      const current = get(id)
      if (!current || !isRunning(current.status)) return current
      return db
        .update(projects)
        .set({
          status: "failed",
          failedStep: current.status,
          error: message,
          updatedAt: now(),
        })
        .where(eq(projects.id, id))
        .returning()
        .get()
    },

    resumeFailed(id: string, to: ProjectStatus): Project {
      return db
        .update(projects)
        .set({ status: to, error: null, failedStep: null, updatedAt: now() })
        .where(and(eq(projects.id, id), eq(projects.status, "failed")))
        .returning()
        .get()
    },

    delete(id: string) {
      db.delete(projects).where(eq(projects.id, id)).run()
    },
  }
}

export function assetRepository(db: Db) {
  return {
    create(input: NewAsset): Asset {
      return db
        .insert(assets)
        .values({ ...input, id: input.id ?? newId() })
        .returning()
        .get()
    },

    get(id: string): Asset | undefined {
      return db.select().from(assets).where(eq(assets.id, id)).get()
    },

    listForProject(projectId: string): Asset[] {
      return db
        .select()
        .from(assets)
        .where(eq(assets.projectId, projectId))
        .all()
    },

    findByKind(projectId: string, kind: Asset["kind"]): Asset | undefined {
      return db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.kind, kind)))
        .orderBy(desc(assets.createdAt))
        .get()
    },

    update(
      id: string,
      patch: Partial<Omit<typeof assets.$inferInsert, "id" | "projectId">>
    ) {
      db.update(assets)
        .set({ ...patch, updatedAt: now() })
        .where(eq(assets.id, id))
        .run()
    },

    delete(id: string) {
      db.delete(assets).where(eq(assets.id, id)).run()
    },

    allStorageKeys(): string[] {
      return db
        .select({ key: assets.storageKey })
        .from(assets)
        .all()
        .map((r) => r.key)
    },
  }
}
