import "server-only"

import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"

import { decryptSecret } from "./crypto"
import { clipParts, partsDuration, type Parted } from "../clips/parts"
import { publishingRepository } from "../publishing/repository"
import { pacificDay } from "../publishing/quota"
import { assertRenderFits, assertStorageFits, claudeRunsError } from "./limits"
import { accountRepository, type Workspace } from "./repository"
import { planFor, usagePeriod, type UsageKind } from "./schema"

export async function recordUsage(
  db: Db,
  project: { id: string | null; workspaceId: string | null },
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

export async function resolveGroqKey(db: Db, workspaceId: string | null) {
  const workspace = workspaceId
    ? await accountRepository(db).getWorkspace(workspaceId)
    : undefined
  if (!workspace?.groqKey) return undefined
  try {
    return decryptSecret(workspace.groqKey)
  } catch (error) {
    logger.error({ err: error }, "couldn't decrypt the workspace's Groq key")
    return undefined
  }
}

export function transcriptionAvailable(workspace: Pick<Workspace, "groqKey">) {
  return getEnv().TRANSCRIBER === "fake" || Boolean(workspace.groqKey)
}

export function claudeAvailable(workspace: Pick<Workspace, "anthropicKey">) {
  return Boolean(workspace.anthropicKey || getEnv().ANTHROPIC_API_KEY)
}

async function limitedPlan(db: Db, workspaceId: string | null) {
  if (!workspaceId) return null
  const workspace = await accountRepository(db).getWorkspace(workspaceId)
  return workspace ? planFor(workspace.plan) : null
}

const clipSeconds = (clips: readonly Parted[]) =>
  clips.reduce((sum, clip) => sum + partsDuration(clipParts(clip)), 0) / 1000

// Clips already queued count too: their minutes are only recorded when they finish.
export async function assertRenderAllowance(
  db: Db,
  workspaceId: string | null,
  clips: readonly (Parted & { id: string })[] = [],
  now = new Date()
) {
  const plan = await limitedPlan(db, workspaceId)
  if (!workspaceId || !plan || plan.renderMinutes === null) return
  const accounts = accountRepository(db)
  const { start, end } = usagePeriod(now)
  const [totals, rendering] = await Promise.all([
    accounts.usageTotals(workspaceId, start, end),
    accounts.renderingClips(workspaceId),
  ])
  const asked = new Set(clips.map((clip) => clip.id))
  assertRenderFits(
    plan,
    totals.renderSeconds +
      clipSeconds(rendering.filter((clip) => !asked.has(clip.id))),
    clipSeconds(clips)
  )
}

export async function assertStorageAllowance(
  db: Db,
  workspaceId: string | null,
  bytes = 0
) {
  const plan = await limitedPlan(db, workspaceId)
  if (!workspaceId || !plan || plan.storageBytes === null) return
  assertStorageFits(
    plan,
    await accountRepository(db).storageBytes(workspaceId),
    bytes
  )
}

export async function claudeRunsUsedUp(
  db: Db,
  workspaceId: string | null,
  now = new Date()
) {
  const plan = await limitedPlan(db, workspaceId)
  if (!workspaceId || !plan || plan.claudeRuns === null) return null
  const { start, end } = usagePeriod(now)
  const totals = await accountRepository(db).usageTotals(
    workspaceId,
    start,
    end
  )
  return claudeRunsError(plan, totals.claudeRuns)
}

export async function assertClaudeRun(db: Db, workspaceId: string | null) {
  const error = await claudeRunsUsedUp(db, workspaceId)
  if (error) throw error
}

export async function usageSummary(
  db: Db,
  workspace: Workspace,
  now = new Date()
) {
  const plan = planFor(workspace.plan)
  const { start, end } = usagePeriod(now)
  const accounts = accountRepository(db)
  const [totals, storageBytes, publishesToday] = await Promise.all([
    accounts.usageTotals(workspace.id, start, end),
    accounts.storageBytes(workspace.id),
    publishingRepository(db).countCreatedOnDay(workspace.id, pacificDay(now)),
  ])
  return {
    plan,
    resetsAt: end,
    renderMinutes: Math.round(totals.renderSeconds / 60),
    claudeRuns: totals.claudeRuns,
    storageBytes,
    publishesToday,
  }
}

export type UsageSummary = Awaited<ReturnType<typeof usageSummary>>
