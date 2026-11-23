import "server-only"

import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import { assets, clips, projects } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"

import type { AudiencePoint } from "../analysis/schema"
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
  async function get(id: string): Promise<Project | undefined> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id))
    return row
  }

  async function getOrThrow(id: string): Promise<Project> {
    const project = await get(id)
    if (!project) throw new AppError("NOT_FOUND", "Project not found")
    return project
  }

  return {
    get,
    getOrThrow,

    async create(input: {
      id?: string
      name: string
      settings: ProjectSettings
      sourceUrl?: string
    }): Promise<Project> {
      const [row] = await db
        .insert(projects)
        .values({
          id: input.id ?? newId(),
          name: input.name,
          status: input.sourceUrl ? "downloading" : "uploaded",
          sourceUrl: input.sourceUrl ?? null,
          settings: input.settings,
        })
        .returning()
      return row!
    },

    async list({ limit = 100 }: { limit?: number } = {}): Promise<
      ProjectListItem[]
    > {
      const rows = await db
        .select()
        .from(projects)
        .orderBy(desc(projects.createdAt))
        .limit(limit)
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.id)
      const counts = new Map(
        (
          await db
            .select({
              projectId: clips.projectId,
              count: sql<number>`count(*)::int`,
            })
            .from(clips)
            .where(
              and(
                inArray(clips.projectId, ids),
                sql`${clips.status} != 'rejected'`
              )
            )
            .groupBy(clips.projectId)
        ).map((r) => [r.projectId, r.count])
      )
      const media = await db
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

    async rename(id: string, name: string) {
      await db
        .update(projects)
        .set({ name, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    async setSourceLanguage(id: string, language: string) {
      await db
        .update(projects)
        .set({ sourceLanguage: language, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    async setAudienceHeatmap(id: string, heatmap: AudiencePoint[]) {
      await db
        .update(projects)
        .set({ audienceHeatmap: heatmap, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    async updateSettings(id: string, settings: ProjectSettings) {
      await db
        .update(projects)
        .set({ settings, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    async setSourceAsset(id: string, assetId: string) {
      await db
        .update(projects)
        .set({ sourceAssetId: assetId, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    async setAwaitingManualSelection(id: string, value: boolean) {
      await db
        .update(projects)
        .set({ awaitingManualSelection: value, updatedAt: now() })
        .where(eq(projects.id, id))
    },

    transition(id: string, to: ProjectStatus): Promise<Project> {
      return withTransaction(db, async (tx) => {
        const [current] = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, id))
          .for("update")
        if (!current) throw new AppError("NOT_FOUND", "Project not found")
        assertTransition(current.status, to)
        const [row] = await tx
          .update(projects)
          .set({
            status: to,
            error: null,
            failedStep: to === "cancelled" ? current.status : null,
            updatedAt: now(),
          })
          .where(eq(projects.id, id))
          .returning()
        return row!
      })
    },

    async markFailed(
      id: string,
      message: string
    ): Promise<Project | undefined> {
      const current = await get(id)
      if (!current || !isRunning(current.status)) return current
      const [row] = await db
        .update(projects)
        .set({
          status: "failed",
          failedStep: current.status,
          error: message,
          updatedAt: now(),
        })
        .where(eq(projects.id, id))
        .returning()
      return row
    },

    async resumeFailed(id: string, to: ProjectStatus): Promise<Project> {
      const [row] = await db
        .update(projects)
        .set({ status: to, error: null, failedStep: null, updatedAt: now() })
        .where(and(eq(projects.id, id), eq(projects.status, "failed")))
        .returning()
      return row!
    },

    async delete(id: string) {
      await db.delete(projects).where(eq(projects.id, id))
    },
  }
}

export function assetRepository(db: Db) {
  return {
    async create(input: NewAsset): Promise<Asset> {
      const [row] = await db
        .insert(assets)
        .values({ ...input, id: input.id ?? newId() })
        .returning()
      return row!
    },

    async get(id: string): Promise<Asset | undefined> {
      const [row] = await db.select().from(assets).where(eq(assets.id, id))
      return row
    },

    listForProject(projectId: string): Promise<Asset[]> {
      return db.select().from(assets).where(eq(assets.projectId, projectId))
    },

    async findByKind(
      projectId: string,
      kind: Asset["kind"]
    ): Promise<Asset | undefined> {
      const [row] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.kind, kind)))
        .orderBy(desc(assets.createdAt))
        .limit(1)
      return row
    },

    async update(
      id: string,
      patch: Partial<Omit<typeof assets.$inferInsert, "id" | "projectId">>
    ) {
      await db
        .update(assets)
        .set({ ...patch, updatedAt: now() })
        .where(eq(assets.id, id))
    },

    async delete(id: string) {
      await db.delete(assets).where(eq(assets.id, id))
    },

    async allStorageKeys(): Promise<string[]> {
      const rows = await db.select({ key: assets.storageKey }).from(assets)
      return rows.map((r) => r.key)
    },
  }
}
