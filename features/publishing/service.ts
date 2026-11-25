import "server-only"

import { eq } from "drizzle-orm"

import type { Workspace } from "@/features/accounts/repository"
import { planFor, YOUTUBE_SCOPES } from "@/features/accounts/schema"
import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { assetRepository } from "@/features/projects/repository"
import { withTransaction, type Db } from "@/lib/db"
import { clips } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage } from "@/lib/storage"

import { accessTokenForAccount, RECONNECT_MESSAGE } from "./google-token"
import { LIST_UNITS, pacificDay } from "./quota"
import {
  publishingRepository,
  type Publication,
  type YouTubeChannel,
} from "./repository"
import type { PublishInput } from "./schema"
import { getYouTubeClient } from "./youtube"

export async function ensureYouTubeChannel(
  db: Db,
  workspaceId: string,
  googleAccount: { id: string; scope: string | null; updatedAt: Date }
): Promise<YouTubeChannel | undefined> {
  if (!YOUTUBE_SCOPES.every((s) => googleAccount.scope?.includes(s))) {
    return undefined
  }

  const repo = publishingRepository(db)
  const existing = await repo.getChannel(workspaceId)
  if (existing?.accountId) {
    if (
      existing.status === "needs_reconnect" &&
      googleAccount.updatedAt > existing.updatedAt
    ) {
      await repo.setChannelStatus(existing.id, "ok")
      return { ...existing, status: "ok" }
    }
    return existing
  }

  const booked = await repo.spendQuota({
    day: pacificDay(new Date()),
    workspaceId,
    kind: "list",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  if (!booked) return existing

  const token = await accessTokenForAccount(db, googleAccount.id)
  const info = await getYouTubeClient().myChannel(token)
  return repo.upsertChannel({
    workspaceId,
    accountId: googleAccount.id,
    channelId: info.channelId,
    title: info.title,
    thumbnailUrl: info.thumbnailUrl,
    status: "ok",
  })
}

const FAILURE_BACKOFF_MS = 10 * 60_000
const failures = new Map<
  string,
  { at: number; message: string; accountUpdatedAt: number }
>()

type GoogleAccount = { id: string; scope: string | null; updatedAt: Date }

export async function syncYouTubeChannel(
  db: Db,
  workspaceId: string,
  googleAccount: GoogleAccount
): Promise<{ channel: YouTubeChannel | undefined; error: string | null }> {
  const repo = publishingRepository(db)
  const failure = failures.get(workspaceId)
  if (
    failure &&
    failure.accountUpdatedAt === googleAccount.updatedAt.getTime() &&
    Date.now() - failure.at < FAILURE_BACKOFF_MS
  ) {
    return {
      channel: await repo.getChannel(workspaceId),
      error: failure.message,
    }
  }

  try {
    const channel = await ensureYouTubeChannel(db, workspaceId, googleAccount)
    failures.delete(workspaceId)
    return { channel, error: null }
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Could not reach YouTube. Try again in a few minutes."
    logger.warn(
      {
        workspaceId,
        code: error instanceof AppError ? error.code : undefined,
        message,
      },
      "YouTube channel sync failed"
    )
    failures.set(workspaceId, {
      at: Date.now(),
      message,
      accountUpdatedAt: googleAccount.updatedAt.getTime(),
    })
    return { channel: await repo.getChannel(workspaceId), error: message }
  }
}

export async function releaseRenderAsset(db: Db, publication: Publication) {
  const assetId = publication.renderAssetId
  if (!assetId) return
  const clip = await clipRepository(db).get(publication.clipId)
  if (clip?.renderAssetId === assetId) return
  if (await publishingRepository(db).assetInActiveUse(assetId)) return
  const assets = assetRepository(db)
  const asset = await assets.get(assetId)
  if (!asset) return
  await assets.delete(asset.id)
  await getStorage().remove(asset.storageKey)
}

export function queuePublication(
  db: Db,
  workspace: Pick<Workspace, "id" | "plan">,
  clipId: string,
  input: PublishInput
) {
  return withTransaction(db, async (tx) => {
    const [clip] = await tx
      .select()
      .from(clips)
      .where(eq(clips.id, clipId))
      .for("update")
    if (!clip) throw new AppError("NOT_FOUND", "Clip not found")
    if (clip.status !== "rendered" || !clip.renderAssetId) {
      throw new AppError("CONFLICT", "Render the latest edit first")
    }
    const repo = publishingRepository(tx)
    const channel = await repo.getChannel(workspace.id)
    if (!channel) throw new AppError("CONFLICT", "Connect YouTube first")
    if (channel.status !== "ok") {
      throw new AppError("CONFLICT", RECONNECT_MESSAGE)
    }
    if (await repo.activeForClip(clip.id)) {
      throw new AppError("CONFLICT", "This clip is already publishing")
    }
    const limit = planFor(workspace.plan).publishesPerDay
    if (
      limit !== null &&
      (await repo.countCreatedOnDay(workspace.id, pacificDay(new Date()))) >=
        limit
    ) {
      throw new AppError(
        "CONFLICT",
        `Your plan allows ${limit} publishes a day`
      )
    }
    const publication = await repo.createPublication({
      clipId: clip.id,
      channelId: channel.id,
      renderAssetId: clip.renderAssetId,
      clipStartMs: clip.startMs,
      clipEndMs: clip.endMs,
      metadata: input,
      status: "queued",
    })
    await jobQueue(tx).enqueue({
      type: "publish_clip",
      projectId: clip.projectId,
      payload: { publicationId: publication.id },
    })
    return publication
  })
}
