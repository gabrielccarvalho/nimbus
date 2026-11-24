import "server-only"

import { and, eq } from "drizzle-orm"
import { connection } from "next/server"

import { accountRepository } from "@/features/accounts/repository"
import { planFor } from "@/features/accounts/schema"
import { assertProjectAccess, requireViewer } from "@/features/accounts/session"
import { clipRepository } from "@/features/clips/repository"
import { getAppSettings } from "@/features/settings/service"
import { getDb } from "@/lib/db"
import { jobs } from "@/lib/db/schema"

import { publishingDefaults } from "./metadata"
import { pacificDay } from "./quota"
import { publishingRepository } from "./repository"
import type { PublicationStatus, PublishInput } from "./schema"
import { syncYouTubeChannel } from "./service"

export async function getYouTubeChannelCard() {
  await connection()
  const { user, workspace } = await requireViewer()
  const db = getDb()
  const google = (await accountRepository(db).linkedAccounts(user.id)).find(
    (a) => a.providerId === "google"
  )
  const { channel, error } = google
    ? await syncYouTubeChannel(db, workspace.id, google)
    : { channel: undefined, error: null }
  if (!channel) return { channel: null, error }
  return {
    channel: {
      title: channel.title,
      thumbnailUrl: channel.thumbnailUrl,
      needsReconnect: channel.status === "needs_reconnect",
      publishedCount: await publishingRepository(db).countPublished(channel.id),
    },
    error,
  }
}

export async function getPublishing(projectId: string) {
  await connection()
  const { workspace } = await requireViewer()
  await assertProjectAccess(projectId)
  const db = getDb()
  const repo = publishingRepository(db)
  const [channel, settings, clips] = await Promise.all([
    repo.getChannel(workspace.id),
    getAppSettings(db, workspace.id),
    clipRepository(db).listForProject(projectId),
  ])
  const latest = await repo.latestForClips(clips.map((c) => c.id))
  const running = await db
    .select({ payload: jobs.payload, progress: jobs.progress })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.type, "publish_clip"),
        eq(jobs.status, "running")
      )
    )
  const progressById = new Map(
    running.map((j) => [String(j.payload.publicationId), j.progress])
  )
  const publications: Record<
    string,
    {
      id: string
      renderAssetId: string | null
      metadata: Pick<PublishInput, "title" | "description" | "tags" | "privacy">
      status: PublicationStatus
      url: string | null
      error: string | null
      progress?: number
    }
  > = {}
  for (const [clipId, p] of latest) {
    const progress = progressById.get(p.id)
    publications[clipId] = {
      id: p.id,
      renderAssetId: p.renderAssetId,
      metadata: {
        title: p.metadata.title,
        description: p.metadata.description,
        tags: p.metadata.tags,
        privacy: p.metadata.privacy,
      },
      status: p.status,
      url: p.url,
      error: p.error,
      ...(progress === undefined ? {} : { progress }),
    }
  }
  const limit = planFor(workspace.plan).publishesPerDay
  const publishesLeftToday =
    limit === null
      ? null
      : Math.max(
          0,
          limit -
            (await repo.countCreatedOnDay(workspace.id, pacificDay(new Date())))
        )
  return {
    channel: channel ? { title: channel.title, status: channel.status } : null,
    defaults: publishingDefaults(settings),
    publications,
    publishesLeftToday,
  }
}
