import "server-only"

import { connection } from "next/server"

import { accountRepository } from "@/features/accounts/repository"
import { requireViewer } from "@/features/accounts/session"
import { getDb } from "@/lib/db"

import { publishingRepository } from "./repository"
import { syncYouTubeChannel } from "./service"

export async function getYouTubeChannelCard() {
  await connection()
  const { user, workspace } = await requireViewer()
  const db = getDb()
  const google = (await accountRepository(db).linkedAccounts(user.id)).find(
    (a) => a.providerId === "google"
  )
  const channel = google
    ? await syncYouTubeChannel(db, workspace.id, google)
    : undefined
  const repo = publishingRepository(db)
  if (!channel) return null
  return {
    title: channel.title,
    thumbnailUrl: channel.thumbnailUrl,
    needsReconnect: channel.status === "needs_reconnect",
    publishedCount: await repo.countPublished(channel.id),
  }
}

export type YouTubeChannelCard = NonNullable<
  Awaited<ReturnType<typeof getYouTubeChannelCard>>
>
