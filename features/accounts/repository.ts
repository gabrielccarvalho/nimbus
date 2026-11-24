import "server-only"

import { and, eq, gte, isNull, lt, sql } from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import {
  account,
  assets,
  projects,
  settings,
  usageEvents,
  user,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema"

import {
  LEGACY_SETTINGS_KEY,
  workspaceSettingsKey,
} from "../settings/repository"
import type { UsageKind } from "./schema"

export type Workspace = typeof workspaces.$inferSelect
export type User = typeof user.$inferSelect

export function accountRepository(db: Db) {
  return {
    async workspaceForUser(userId: string): Promise<Workspace | undefined> {
      const [row] = await db
        .select({ workspace: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, userId))
        .orderBy(workspaceMembers.createdAt)
        .limit(1)
      return row?.workspace
    },

    async getWorkspace(id: string): Promise<Workspace | undefined> {
      const [row] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
      return row
    },

    createPersonalWorkspace(owner: { id: string; name: string }) {
      return withTransaction(db, async (tx) => {
        const [first] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(workspaces)
        const claimLegacy = (first?.count ?? 0) === 0
        const firstName = owner.name.trim().split(/\s+/)[0] || "My"
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            id: newId(),
            name: `${firstName}'s studio`,
          })
          .returning()
        await tx.insert(workspaceMembers).values({
          workspaceId: workspace!.id,
          userId: owner.id,
          role: "owner",
        })
        if (claimLegacy) {
          await tx
            .update(projects)
            .set({ workspaceId: workspace!.id })
            .where(isNull(projects.workspaceId))
          const [legacy] = await tx
            .select()
            .from(settings)
            .where(eq(settings.key, LEGACY_SETTINGS_KEY))
          if (legacy) {
            await tx
              .insert(settings)
              .values({
                key: workspaceSettingsKey(workspace!.id),
                value: legacy.value,
              })
              .onConflictDoNothing()
          }
        }
        return workspace!
      })
    },

    async renameWorkspace(id: string, name: string) {
      await db
        .update(workspaces)
        .set({ name, updatedAt: now() })
        .where(eq(workspaces.id, id))
    },

    async setAnthropicKey(
      id: string,
      sealed: string | null,
      hint: string | null
    ) {
      await db
        .update(workspaces)
        .set({ anthropicKey: sealed, anthropicKeyHint: hint, updatedAt: now() })
        .where(eq(workspaces.id, id))
    },

    async recordUsage(input: {
      workspaceId: string
      projectId?: string | null
      kind: UsageKind
      amount: number
    }) {
      await db.insert(usageEvents).values({
        id: newId(),
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        kind: input.kind,
        amount: input.amount,
      })
    },

    async usageTotals(workspaceId: string, from: Date, to: Date) {
      const rows = await db
        .select({
          kind: usageEvents.kind,
          total: sql<number>`coalesce(sum(${usageEvents.amount}), 0)::float`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.workspaceId, workspaceId),
            gte(usageEvents.createdAt, from),
            lt(usageEvents.createdAt, to)
          )
        )
        .groupBy(usageEvents.kind)
      const total = (kind: UsageKind) =>
        rows.find((r) => r.kind === kind)?.total ?? 0
      return {
        renderSeconds: total("render_seconds"),
        claudeRuns: total("claude_run"),
      }
    },

    async storageBytes(workspaceId: string) {
      const [row] = await db
        .select({
          total: sql<number>`coalesce(sum(${assets.bytes}), 0)::float`,
        })
        .from(assets)
        .innerJoin(projects, eq(projects.id, assets.projectId))
        .where(eq(projects.workspaceId, workspaceId))
      return row?.total ?? 0
    },

    async linkedAccounts(userId: string) {
      return db
        .select({
          id: account.id,
          providerId: account.providerId,
          accountId: account.accountId,
          scope: account.scope,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })
        .from(account)
        .where(eq(account.userId, userId))
    },
  }
}
