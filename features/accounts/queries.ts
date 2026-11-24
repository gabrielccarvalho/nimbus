import "server-only"

import { headers } from "next/headers"
import { connection } from "next/server"

import { syncYouTubeChannel } from "@/features/publishing/service"
import { getDb } from "@/lib/db"

import { enabledSocialProviders, getAuth } from "./auth"
import { accountRepository } from "./repository"
import { describeDevice, YOUTUBE_SCOPES } from "./schema"
import { requireViewer } from "./session"
import { usageSummary } from "./usage"

export async function getProfileSettings() {
  await connection()
  const { user } = await requireViewer()
  return {
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    memberSince: user.createdAt,
  }
}

export async function getPlanSettings() {
  await connection()
  const { workspace } = await requireViewer()
  return usageSummary(getDb(), workspace)
}

export async function getWorkspaceSettings() {
  await connection()
  const { workspace } = await requireViewer()
  return {
    name: workspace.name,
    image: workspace.image,
    keyHint: workspace.anthropicKeyHint,
  }
}

export async function getSecuritySettings() {
  await connection()
  const { user, session } = await requireViewer()
  const [linked, sessions] = await Promise.all([
    accountRepository(getDb()).linkedAccounts(user.id),
    getAuth().api.listSessions({ headers: await headers() }),
  ])
  const credential = linked.find((a) => a.providerId === "credential")
  return {
    hasPassword: Boolean(credential),
    passwordChangedAt: credential?.updatedAt ?? null,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    sessions: sessions
      .map((s) => ({
        id: s.id,
        device: describeDevice(s.userAgent ?? null),
        ipAddress: s.ipAddress ?? null,
        updatedAt: s.updatedAt,
        current: s.id === session.id,
      }))
      .sort(
        (a, b) =>
          Number(b.current) - Number(a.current) ||
          b.updatedAt.getTime() - a.updatedAt.getTime()
      ),
  }
}

export async function getChannelSettings() {
  await connection()
  const { user, workspace } = await requireViewer()
  const linked = await accountRepository(getDb()).linkedAccounts(user.id)
  const providers = enabledSocialProviders()
  const google = linked.find((a) => a.providerId === "google")
  const twitch = linked.find((a) => a.providerId === "twitch")
  const youtubeConnected = Boolean(
    google && YOUTUBE_SCOPES.every((scope) => google.scope?.includes(scope))
  )
  const channel =
    google && youtubeConnected
      ? await syncYouTubeChannel(getDb(), workspace.id, google)
      : undefined
  return [
    {
      id: "youtube" as const,
      name: "YouTube",
      configured: providers.google,
      connectedAt: youtubeConnected ? google!.updatedAt : null,
      providerId: "google" as const,
      accountId: google?.accountId ?? null,
      needsReconnect: channel?.status === "needs_reconnect",
      channelTitle: channel?.title ?? null,
    },
    {
      id: "twitch" as const,
      name: "Twitch",
      configured: providers.twitch,
      connectedAt: twitch?.updatedAt ?? null,
      providerId: "twitch" as const,
      accountId: twitch?.accountId ?? null,
      needsReconnect: false,
      channelTitle: null,
    },
    {
      id: "tiktok" as const,
      name: "TikTok",
      configured: false,
      connectedAt: null,
      providerId: null,
      accountId: null,
      needsReconnect: false,
      channelTitle: null,
    },
    {
      id: "instagram" as const,
      name: "Instagram",
      configured: false,
      connectedAt: null,
      providerId: null,
      accountId: null,
      needsReconnect: false,
      channelTitle: null,
    },
  ]
}

export type ChannelRow = Awaited<ReturnType<typeof getChannelSettings>>[number]
export type SecuritySettings = Awaited<ReturnType<typeof getSecuritySettings>>
