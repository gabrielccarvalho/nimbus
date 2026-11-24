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
