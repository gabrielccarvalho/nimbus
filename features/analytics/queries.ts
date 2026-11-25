import "server-only"

import { connection } from "next/server"

import { requireViewer } from "@/features/accounts/session"
import { getDb } from "@/lib/db"

import { publishingRepository } from "../publishing/repository"
import type { PublicationOrigin } from "../publishing/schema"
import { statsEarly } from "../publishing/stats"
import { statsRepository } from "../publishing/stats-repository"
import {
  dailySeries,
  medianCurve,
  periodSummary,
  periodWindow,
  relativePerformance,
  type DailyPoint,
} from "./curves"
import { analyticsRepository } from "./repository"
import { ANALYTICS_SYNC_EVERY_MS, type AnalyticsPeriod } from "./schema"
import { channelCurves, enqueueChannelSync } from "./service"

const DAY_MS = 86_400_000
const TOP_SHORTS = 5
const UNTITLED_SHORT = "Untitled Short"

export type TopShort = {
  publicationId: string
  title: string
  clipId: string | null
  projectId: string | null
  url: string | null
  views: number
}

export type ShortRow = {
  publicationId: string
  origin: PublicationOrigin
  clipId: string | null
  projectId: string | null
  title: string
  url: string | null
  publishedAt: Date
  ageDays: number
  views: number | null
  averageViewPercentage: number | null
  viewsDay1: number | null
  viewsDay7: number | null
  viewsDay28: number | null
  relative: number | null
  early: boolean
  curve: number[]
}

export type ImportState =
  | { state: "idle"; error: string | null }
  | { state: "running"; progress: number }
  | { state: "waiting_quota"; resumesAt: Date }

async function viewerChannel() {
  const { workspace } = await requireViewer()
  return publishingRepository(getDb()).getChannel(workspace.id)
}

export async function getAnalyticsChannel(): Promise<{
  title: string
  needsReconnect: boolean
} | null> {
  await connection()
  const channel = await viewerChannel()
  return channel
    ? {
        title: channel.title,
        needsReconnect: channel.status === "needs_reconnect",
      }
    : null
}

export async function getAnalyticsOverview(period: AnalyticsPeriod): Promise<{
  dataThrough: string | null
  split: boolean
  summary: ReturnType<typeof periodSummary> | null
  series: DailyPoint[]
  topShorts: TopShort[]
  syncing: boolean
}> {
  await connection()
  const channel = await viewerChannel()
  const empty = {
    dataThrough: null,
    split: false,
    summary: null,
    series: [],
    topShorts: [],
    syncing: false,
  }
  if (!channel) return empty

  const db = getDb()
  const analytics = analyticsRepository(db)
  const syncedAt = channel.analyticsSyncedAt
  if (
    channel.status === "ok" &&
    (!syncedAt || Date.now() - syncedAt.getTime() > ANALYTICS_SYNC_EVERY_MS)
  ) {
    await enqueueChannelSync(db, channel.id)
  }
  const syncing = await analytics.channelJobActive("sync_channel", channel.id)
  const through = await analytics.lastChannelDay(channel.id)
  if (!through) return { ...empty, syncing }

  const window = periodWindow(period, through)
  const [days, top] = await Promise.all([
    analytics.channelDays(channel.id, window.previousFrom, window.to),
    analytics.topPublications(channel.id, period, TOP_SHORTS),
  ])
  const topShorts = top.map(({ publication, clip, views }) => ({
    publicationId: publication.id,
    title: publication.metadata.title || (clip?.title ?? ""),
    clipId: clip?.id ?? null,
    projectId: clip?.projectId ?? null,
    url: publication.url,
    views,
  }))

  return {
    dataThrough: through,
    split: days.some((d) => d.day >= window.from && d.contentType !== "other"),
    summary: periodSummary(days, window),
    series: dailySeries(days, window.from, window.to),
    topShorts,
    syncing,
  }
}

const viewsAt = (curve: number[], day: number) => curve[day] ?? null

export async function getShorts(): Promise<{
  rows: ShortRow[]
  median: (number | null)[]
  dataThrough: string | null
  importing: ImportState
  uploadsSyncedAt: Date | null
}> {
  await connection()
  const channel = await viewerChannel()
  if (!channel) {
    return {
      rows: [],
      median: [],
      dataThrough: null,
      importing: { state: "idle", error: null },
      uploadsSyncedAt: null,
    }
  }

  const db = getDb()
  const [entries, job] = await Promise.all([
    statsRepository(db).forChannel(channel.id),
    analyticsRepository(db).latestChannelJob("sync_uploads", channel.id),
  ])
  const { dataThrough, curves } = await channelCurves(db, channel.id, entries)
  const now = new Date()
  const peers = [...curves].map(([publicationId, cumulative]) => ({
    publicationId,
    cumulative,
  }))
  const rows = entries.flatMap(
    ({ publication, clip, projectId, latest }): ShortRow[] => {
      const { publishedAt } = publication
      if (!publishedAt) return []
      const curve = curves.get(publication.id) ?? []
      return [
        {
          publicationId: publication.id,
          origin: publication.origin,
          clipId: clip?.id ?? null,
          projectId,
          title: publication.metadata.title || clip?.title || UNTITLED_SHORT,
          url: publication.url,
          publishedAt,
          ageDays: Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS),
          views: latest?.views ?? null,
          averageViewPercentage: latest?.averageViewPercentage ?? null,
          viewsDay1: viewsAt(curve, 1),
          viewsDay7: viewsAt(curve, 7),
          viewsDay28: viewsAt(curve, 28),
          relative: relativePerformance(
            { publicationId: publication.id, cumulative: curve },
            peers
          ),
          early: statsEarly(publishedAt, now),
          curve,
        },
      ]
    }
  )

  let importing: ImportState = { state: "idle", error: null }
  if (job?.status === "running") {
    importing = { state: "running", progress: job.progress }
  } else if (job?.status === "queued") {
    importing =
      job.runAfter > now
        ? { state: "waiting_quota", resumesAt: job.runAfter }
        : { state: "running", progress: 0 }
  } else if (job?.status === "failed") {
    importing = { state: "idle", error: job.error }
  }

  return {
    rows,
    median: medianCurve([...curves.values()]),
    dataThrough,
    importing,
    uploadsSyncedAt: channel.uploadsSyncedAt,
  }
}
