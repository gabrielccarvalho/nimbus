import type { PrivacyStatus } from "@/features/publishing/schema"

export const channelContentTypes = ["shorts", "long", "other"] as const
export type ChannelContentType = (typeof channelContentTypes)[number]

export const ANALYTICS_PERIODS = [7, 28, 90] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]
export const DEFAULT_PERIOD: AnalyticsPeriod = 28

export function parsePeriod(value: unknown): AnalyticsPeriod {
  const period = Number(value)
  return ANALYTICS_PERIODS.find((p) => p === period) ?? DEFAULT_PERIOD
}

export const ANALYTICS_SYNC_EVERY_MS = 24 * 3_600_000
export const CHANNEL_BACKFILL_DAYS = 90
export const LATE_DATA_DAYS = 3
export const UPLOADS_OVERLAP_DAYS = 7
export const CHANNEL_CURVE_DAYS = 31

export type DailyViews = {
  day: string
  views: number
  estimatedMinutesWatched: number
  likes: number
  subscribersGained: number
}

export type ChannelDay = {
  day: string
  contentType: ChannelContentType
  views: number
  estimatedMinutesWatched: number
  averageViewDurationS: number | null
  likes: number
  comments: number
  shares: number
  subscribersGained: number
  subscribersLost: number
}

export type ImportedShort = {
  videoId: string
  title: string
  publishedAt: Date
  durationMs: number
  privacy: PrivacyStatus
}

export type ChannelJobType = "sync_uploads" | "sync_channel"

export type VideoDetails = {
  videoId: string
  title: string
  publishedAt: Date
  durationMs: number | null
  privacy: PrivacyStatus
  uploadStatus: string
}
