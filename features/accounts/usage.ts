import "server-only"

import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"

import { decryptSecret } from "./crypto"
import { accountRepository, type Workspace } from "./repository"
import { PLANS, usagePeriod, type UsageKind } from "./schema"

export async function recordUsage(
  db: Db,
  project: { id: string; workspaceId: string | null },
  kind: UsageKind,
  amount: number
) {
  if (!project.workspaceId || amount <= 0) return
  await accountRepository(db).recordUsage({
    workspaceId: project.workspaceId,
    projectId: project.id,
    kind,
    amount,
  })
}

export function workspaceAnthropicKey(workspace: Workspace) {
  if (!workspace.anthropicKey) return undefined
  try {
    return decryptSecret(workspace.anthropicKey)
  } catch (error) {
    logger.error({ err: error }, "couldn't decrypt the workspace's Claude key")
    return undefined
  }
}

export async function resolveAnthropicKey(db: Db, workspaceId: string | null) {
  const workspace = workspaceId
    ? await accountRepository(db).getWorkspace(workspaceId)
    : undefined
  return (
    (workspace && workspaceAnthropicKey(workspace)) ??
    getEnv().ANTHROPIC_API_KEY
  )
}

export function claudeAvailable(workspace: Pick<Workspace, "anthropicKey">) {
  return Boolean(workspace.anthropicKey || getEnv().ANTHROPIC_API_KEY)
}

export async function usageSummary(
  db: Db,
  workspace: Workspace,
  now = new Date()
) {
  const plan = PLANS[workspace.plan] ?? PLANS.free
  const { start, end } = usagePeriod(now)
  const accounts = accountRepository(db)
  const [totals, storageBytes] = await Promise.all([
    accounts.usageTotals(workspace.id, start, end),
    accounts.storageBytes(workspace.id),
  ])
  return {
    plan,
    resetsAt: end,
    renderMinutes: Math.round(totals.renderSeconds / 60),
    claudeRuns: totals.claudeRuns,
    storageBytes,
  }
}

export type UsageSummary = Awaited<ReturnType<typeof usageSummary>>
