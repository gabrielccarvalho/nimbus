import { z } from "zod"

export const planIds = ["free", "creator", "studio", "admin"] as const
export type PlanId = (typeof planIds)[number]

export type Plan = {
  id: PlanId
  name: string
  renderMinutes: number | null
  storageBytes: number | null
  claudeRuns: number | null
  publishesPerDay: number | null
}

const GB = 1024 ** 3

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    renderMinutes: 60,
    storageBytes: 25 * GB,
    claudeRuns: 10,
    publishesPerDay: 2,
  },
  creator: {
    id: "creator",
    name: "Creator",
    renderMinutes: 300,
    storageBytes: 100 * GB,
    claudeRuns: 40,
    publishesPerDay: 5,
  },
  studio: {
    id: "studio",
    name: "Studio",
    renderMinutes: 1200,
    storageBytes: 500 * GB,
    claudeRuns: 200,
    publishesPerDay: 15,
  },
  admin: {
    id: "admin",
    name: "Admin",
    renderMinutes: null,
    storageBytes: null,
    claudeRuns: null,
    publishesPerDay: null,
  },
}

export function planFor(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free
}

export const ADMIN_EMAIL_DOMAIN = "nimbus.dev"

export function planForEmail(email: string): PlanId {
  return email.trim().toLowerCase().endsWith(`@${ADMIN_EMAIL_DOMAIN}`)
    ? "admin"
    : "free"
}

export const usageKinds = ["render_seconds", "claude_run"] as const
export type UsageKind = (typeof usageKinds)[number]

export function usagePeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export const nameSchema = z.string().trim().min(1, "Enter a name").max(80)

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)

export const anthropicKeySchema = z
  .string()
  .trim()
  .regex(/^sk-ant-[\w-]{20,}$/, "That doesn't look like a Claude API key")

export const CLAUDE_KEY_MISSING_MESSAGE =
  "Add a Claude API key in Workspace settings to use Claude."

export function keyHint(key: string) {
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0] ?? "?")[0]!
  return letters.toUpperCase()
}

export type Device = {
  browser: string
  os: string
  mobile: boolean
}

export function describeDevice(userAgent: string | null): Device | null {
  if (!userAgent) return null
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? "Firefox"
      : /Chrome\/|CriOS\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser"
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "an unknown system"
  return { browser, os, mobile: /Mobile|iPhone|Android/.test(userAgent) }
}

export const channelProviders = [
  "youtube",
  "twitch",
  "tiktok",
  "instagram",
] as const
export type ChannelProvider = (typeof channelProviders)[number]

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
]
export const TWITCH_SCOPES = ["user:read:broadcast"]
