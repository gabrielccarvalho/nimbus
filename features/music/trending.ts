import "server-only"

import type { Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

import { withGoogleToken } from "../publishing/google-token"
import { LIST_UNITS, pacificDay, SEARCH_UNITS } from "../publishing/quota"
import { publishingRepository } from "../publishing/repository"
import { getYouTubeClient } from "../publishing/youtube"
import type { TrendingMusic, TrendingVideo } from "./schema"

const TRENDING_COUNT = 20
const SEARCH_COUNT = 10
const DEFAULT_REGION = "US"
const CHART_TTL_MS = 60 * 60_000
const FAILURE_BACKOFF_MS = 10 * 60_000

const charts = new Map<string, { at: number; tracks: TrendingVideo[] }>()
const failures = new Map<string, { at: number; message: string }>()
const searches = new Map<string, { at: number; tracks: TrendingVideo[] }>()

export function regionFromLanguages(header: string | null): string {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim()
    const region = tag
      .split("-")
      .slice(1)
      .find((subtag) => /^[a-z]{2}$/i.test(subtag))
    if (region) return region.toUpperCase()
  }
  return DEFAULT_REGION
}

export async function trendingMusicFor(
  db: Db,
  workspaceId: string,
  region: string
): Promise<TrendingMusic> {
  const cached = charts.get(region)
  if (cached && Date.now() - cached.at < CHART_TTL_MS) {
    return { status: "ok", region, tracks: cached.tracks }
  }

  const repo = publishingRepository(db)
  const channel = await repo.getChannel(workspaceId)
  if (!channel) return { status: "no_channel" }

  const key = `${workspaceId}:${region}`
  const failure = failures.get(key)
  if (failure && Date.now() - failure.at < FAILURE_BACKOFF_MS) {
    return { status: "error", message: failure.message }
  }

  const booked = await repo.spendQuota({
    day: pacificDay(new Date()),
    workspaceId,
    kind: "list",
    units: LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  if (!booked) {
    return {
      status: "error",
      message:
        "Today's YouTube quota is used up. Trending music is back after the reset.",
    }
  }

  try {
    const tracks = await withGoogleToken(db, channel, (token) =>
      getYouTubeClient().trendingMusic(token, region, TRENDING_COUNT)
    )
    charts.set(region, { at: Date.now(), tracks })
    failures.delete(key)
    return { status: "ok", region, tracks }
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Could not reach YouTube. Try again in a few minutes."
    logger.warn(
      {
        workspaceId,
        region,
        code: error instanceof AppError ? error.code : undefined,
        message,
      },
      "Trending music fetch failed"
    )
    failures.set(key, { at: Date.now(), message })
    return { status: "error", message }
  }
}

export async function searchMusicFor(
  db: Db,
  workspaceId: string,
  region: string,
  query: string
): Promise<TrendingVideo[]> {
  const key = `${region}:${query.toLowerCase()}`
  const cached = searches.get(key)
  if (cached && Date.now() - cached.at < CHART_TTL_MS) return cached.tracks

  const repo = publishingRepository(db)
  const channel = await repo.getChannel(workspaceId)
  if (!channel) {
    throw new AppError(
      "CONFLICT",
      "Connect YouTube in Settings › Connected channels to search for songs."
    )
  }
  const booked = await repo.spendQuota({
    day: pacificDay(new Date()),
    workspaceId,
    kind: "list",
    units: SEARCH_UNITS + LIST_UNITS,
    budget: getEnv().YOUTUBE_DAILY_QUOTA,
  })
  if (!booked) {
    throw new AppError(
      "CONFLICT",
      "Today's YouTube quota is used up. Song search is back after the reset."
    )
  }
  const tracks = await withGoogleToken(db, channel, (token) =>
    getYouTubeClient().searchMusic(token, query, region, SEARCH_COUNT)
  )
  searches.set(key, { at: Date.now(), tracks })
  return tracks
}

export function clearTrendingCache() {
  charts.clear()
  failures.clear()
  searches.clear()
}
