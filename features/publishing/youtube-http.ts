import "server-only"

import { createReadStream } from "node:fs"
import { pipeline, Readable, Transform } from "node:stream"

import type { ChannelDay } from "@/features/analytics/schema"
import { contentTypeOf, parseIsoDuration } from "@/features/analytics/shorts"
import { AppError } from "@/lib/errors"

import type { PrivacyStatus } from "./schema"
import type { YouTubeClient } from "./youtube"
import type { RetentionPoint } from "./stats"

const API = "https://www.googleapis.com"
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports"

type GoogleError = {
  error?: { message?: string; errors?: { reason?: string }[] }
}

async function failure(response: Response): Promise<AppError> {
  const body = (await response.json().catch(() => ({}))) as GoogleError
  const reason = body.error?.errors?.[0]?.reason
  const message = body.error?.message ?? `YouTube returned ${response.status}`
  if (response.status === 401) {
    return new AppError("UNAUTHORIZED", "YouTube rejected the access token", {
      cause: "token",
    })
  }
  if (response.status === 403 && reason === "quotaExceeded") {
    return new AppError("EXTERNAL", "YouTube API quota exceeded", {
      cause: "quota",
    })
  }
  if (response.status === 403 && reason === "uploadLimitExceeded") {
    return new AppError(
      "VALIDATION",
      "This channel hit YouTube's own upload limit for today"
    )
  }
  if (response.status >= 400 && response.status < 500) {
    return new AppError("VALIDATION", message)
  }
  return new AppError("EXTERNAL", message)
}

async function send(
  url: string,
  init: RequestInit & { duplex?: "half" }
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new AppError("EXTERNAL", "Could not reach YouTube", { cause: error })
  }
  return response
}

type AnalyticsReport = {
  columnHeaders?: { name: string }[]
  rows?: (number | string)[][]
}

function column(report: AnalyticsReport, name: string): number | null {
  const index = report.columnHeaders?.findIndex(
    (header) => header.name === name
  )
  if (index === undefined || index < 0) return null
  const value = report.rows?.[0]?.[index]
  return value === undefined ? null : Number(value)
}

function dayColumn(at: (name: string) => number): number {
  const index = at("day")
  if (index < 0) {
    throw new AppError("EXTERNAL", "YouTube analytics returned no day column")
  }
  return index
}

function columnIndexes(report: AnalyticsReport) {
  const indexes = new Map<string, number>()
  report.columnHeaders?.forEach((header, index) => {
    indexes.set(header.name, index)
  })
  return (name: string) => indexes.get(name) ?? -1
}

const CHANNEL_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
]

export class YouTubeHttp implements YouTubeClient {
  async myChannel(token: string) {
    const response = await send(
      `${API}/youtube/v3/channels?part=snippet&mine=true`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        id: string
        snippet: {
          title: string
          thumbnails?: { default?: { url?: string } }
        }
      }[]
    }
    const item = body.items?.[0]
    if (!item) {
      throw new AppError(
        "NOT_FOUND",
        "This Google account has no YouTube channel"
      )
    }
    return {
      channelId: item.id,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    }
  }

  async startUpload(token: string, body: object, bytes: number) {
    const response = await send(
      `${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-length": String(bytes),
          "x-upload-content-type": "video/*",
        },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) throw await failure(response)
    const location = response.headers.get("location")
    if (!location) {
      throw new AppError("EXTERNAL", "YouTube did not return an upload URL")
    }
    return location
  }

  async uploadedBytes(token: string, uploadUri: string, bytes: number) {
    const response = await send(uploadUri, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-length": "0",
        "content-range": `bytes */${bytes}`,
      },
    })
    if (response.status === 308) {
      const range = /bytes=0-(\d+)/.exec(response.headers.get("range") ?? "")
      return range ? Number(range[1]) + 1 : 0
    }
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { id: string }
    return { videoId: body.id }
  }

  async uploadFrom(
    token: string,
    uploadUri: string,
    file: string,
    offset: number,
    bytes: number,
    signal: AbortSignal,
    onProgress: (sent: number) => void
  ) {
    let sent = offset
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sent += chunk.length
        onProgress(sent)
        callback(null, chunk)
      },
    })
    const source = createReadStream(file, { start: offset })
    let readError: Error | undefined
    pipeline(source, counter, (error) => {
      if (error && !signal.aborted) readError = error
    })
    let response: Response
    try {
      response = await send(uploadUri, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-length": String(bytes - offset),
          "content-range": `bytes ${offset}-${bytes - 1}/${bytes}`,
        },
        body: Readable.toWeb(counter) as ReadableStream,
        duplex: "half",
        signal,
      })
    } catch (error) {
      if (readError) {
        throw new AppError("STORAGE", "Could not read the clip to upload", {
          cause: readError,
        })
      }
      throw error
    } finally {
      source.destroy()
      counter.destroy()
    }
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { id: string }
    return { videoId: body.id }
  }

  async videoStats(token: string, videoId: string) {
    const response = await send(
      `${API}/youtube/v3/videos?${new URLSearchParams({ part: "statistics,snippet,status", id: videoId })}`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (response.status === 404) {
      const body = (await response
        .clone()
        .json()
        .catch(() => ({}))) as GoogleError
      if (body.error?.errors?.[0]?.reason === "videoNotFound") return null
    }
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        snippet?: { title?: string }
        status?: { privacyStatus?: PrivacyStatus }
        statistics?: {
          viewCount?: string
          likeCount?: string
          commentCount?: string
        }
      }[]
    }
    const item = body.items?.[0]
    if (!item) return null
    const privacy = item.status?.privacyStatus
    if (!privacy) {
      throw new AppError("EXTERNAL", "YouTube didn't return the video's status")
    }
    return {
      views: Number(item.statistics?.viewCount ?? 0),
      likes: Number(item.statistics?.likeCount ?? 0),
      comments: Number(item.statistics?.commentCount ?? 0),
      title: item.snippet?.title ?? "",
      privacy,
    }
  }

  async uploadsPlaylist(token: string) {
    const response = await send(
      `${API}/youtube/v3/channels?part=contentDetails&mine=true`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        contentDetails?: { relatedPlaylists?: { uploads?: string } }
      }[]
    }
    const uploads = body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploads) {
      throw new AppError(
        "NOT_FOUND",
        "This Google account has no YouTube channel"
      )
    }
    return uploads
  }

  async playlistPage(
    token: string,
    playlistId: string,
    pageToken: string | null
  ) {
    const query = new URLSearchParams({
      part: "contentDetails",
      playlistId,
      maxResults: "50",
    })
    if (pageToken) query.set("pageToken", pageToken)
    const response = await send(`${API}/youtube/v3/playlistItems?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        contentDetails: { videoId: string; videoPublishedAt?: string }
      }[]
      nextPageToken?: string
      pageInfo?: { totalResults?: number }
    }
    const items = (body.items ?? []).map((item) => ({
      videoId: item.contentDetails.videoId,
      publishedAt: item.contentDetails.videoPublishedAt
        ? new Date(item.contentDetails.videoPublishedAt)
        : null,
    }))
    return {
      items,
      nextPageToken: body.nextPageToken ?? null,
      total: body.pageInfo?.totalResults ?? items.length,
    }
  }

  async videoDetails(token: string, videoIds: string[]) {
    if (videoIds.length > 50) {
      throw new AppError("INTERNAL", "videos.list takes at most 50 ids")
    }
    const query = new URLSearchParams({
      part: "snippet,contentDetails,status",
      id: videoIds.join(","),
    })
    const response = await send(`${API}/youtube/v3/videos?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        id: string
        snippet: { title: string; publishedAt: string }
        contentDetails?: { duration?: string }
        status?: { privacyStatus?: PrivacyStatus; uploadStatus?: string }
      }[]
    }
    return (body.items ?? []).flatMap((item) => {
      const privacy = item.status?.privacyStatus
      const uploadStatus = item.status?.uploadStatus
      if (!privacy || !uploadStatus) return []
      return [
        {
          videoId: item.id,
          title: item.snippet.title,
          publishedAt: new Date(item.snippet.publishedAt),
          durationMs: item.contentDetails?.duration
            ? parseIsoDuration(item.contentDetails.duration)
            : null,
          privacy,
          uploadStatus,
        },
      ]
    })
  }

  private async report(
    token: string,
    startDate: string,
    endDate: string,
    params: Record<string, string>
  ) {
    const query = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      ...params,
    })
    const response = await send(`${ANALYTICS}?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw await failure(response)
    return (await response.json()) as AnalyticsReport
  }

  async videoContentType(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ) {
    const report = await this.report(token, startDate, endDate, {
      dimensions: "creatorContentType",
      metrics: "views",
      filters: `video==${videoId}`,
    })
    const at = columnIndexes(report)("creatorContentType")
    const value = at < 0 ? undefined : report.rows?.[0]?.[at]
    return typeof value === "string" ? value : null
  }

  async videoDaily(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ) {
    const report = await this.report(token, startDate, endDate, {
      dimensions: "day",
      metrics: "views,estimatedMinutesWatched,likes,subscribersGained",
      filters: `video==${videoId}`,
      sort: "day",
    })
    const at = columnIndexes(report)
    const dayAt = dayColumn(at)
    const value = (row: (string | number)[], name: string) =>
      Number(row[at(name)] ?? 0)
    return (report.rows ?? []).map((row) => ({
      day: String(row[dayAt]),
      views: value(row, "views"),
      estimatedMinutesWatched: value(row, "estimatedMinutesWatched"),
      likes: value(row, "likes"),
      subscribersGained: value(row, "subscribersGained"),
    }))
  }

  async channelDaily(token: string, startDate: string, endDate: string) {
    const metrics = CHANNEL_METRICS.join(",")
    let split = true
    let report: AnalyticsReport
    try {
      report = await this.report(token, startDate, endDate, {
        dimensions: "day,creatorContentType",
        metrics,
        sort: "day",
      })
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "VALIDATION") {
        throw error
      }
      split = false
      report = await this.report(token, startDate, endDate, {
        dimensions: "day",
        metrics,
        sort: "day",
      })
    }
    const at = columnIndexes(report)
    const dayAt = dayColumn(at)
    const merged = new Map<string, ChannelDay>()
    for (const row of report.rows ?? []) {
      const day = String(row[dayAt])
      const contentType = split
        ? contentTypeOf(String(row[at("creatorContentType")]))
        : "other"
      const key = `${day}|${contentType}`
      const number = (name: string) => Number(row[at(name)] ?? 0)
      const views = number("views")
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {
          day,
          contentType,
          views,
          estimatedMinutesWatched: number("estimatedMinutesWatched"),
          averageViewDurationS: number("averageViewDuration"),
          likes: number("likes"),
          comments: number("comments"),
          shares: number("shares"),
          subscribersGained: number("subscribersGained"),
          subscribersLost: number("subscribersLost"),
        })
        continue
      }
      const total = existing.views + views
      existing.averageViewDurationS =
        total > 0
          ? ((existing.averageViewDurationS ?? 0) * existing.views +
              number("averageViewDuration") * views) /
            total
          : existing.averageViewDurationS
      existing.views = total
      existing.estimatedMinutesWatched += number("estimatedMinutesWatched")
      existing.likes += number("likes")
      existing.comments += number("comments")
      existing.shares += number("shares")
      existing.subscribersGained += number("subscribersGained")
      existing.subscribersLost += number("subscribersLost")
    }
    return { split, rows: [...merged.values()] }
  }

  async videoAnalytics(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ) {
    const report = async (params: Record<string, string>) => {
      const query = new URLSearchParams({
        ids: "channel==MINE",
        startDate,
        endDate,
        filters: `video==${videoId}`,
        ...params,
      })
      const response = await send(`${ANALYTICS}?${query}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw await failure(response)
      return (await response.json()) as AnalyticsReport
    }
    const totals = await report({
      metrics: "views,averageViewDuration,averageViewPercentage",
    })
    const curve = await report({
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio",
    })
    const ratioAt = curve.columnHeaders?.findIndex(
      (header) => header.name === "elapsedVideoTimeRatio"
    )
    const watchAt = curve.columnHeaders?.findIndex(
      (header) => header.name === "audienceWatchRatio"
    )
    const retention: RetentionPoint[] = []
    if (
      ratioAt !== undefined &&
      ratioAt >= 0 &&
      watchAt !== undefined &&
      watchAt >= 0
    ) {
      for (const row of curve.rows ?? []) {
        const ratio = row[ratioAt]
        const watch = row[watchAt]
        if (ratio !== undefined && watch !== undefined) {
          retention.push({ ratio: Number(ratio), watch: Number(watch) })
        }
      }
    }
    return {
      averageViewDurationS: column(totals, "averageViewDuration"),
      averageViewPercentage: column(totals, "averageViewPercentage"),
      retention,
    }
  }
}
