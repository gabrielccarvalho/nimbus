import "server-only"

import { AppError } from "@/lib/errors"

import type { ChannelDay, DailyViews } from "@/features/analytics/schema"

import type { VideoStats, YouTubeClient } from "./youtube"

const DAY_MS = 86_400_000

type FakeUpload = {
  id: string
  title: string
  durationS: number
  daysAgo: number
  contentType: "SHORTS" | "VIDEO_ON_DEMAND"
}

export const FAKE_PAST_UPLOADS: FakeUpload[] = [
  {
    id: "fake-past-1",
    title: "Past short one",
    durationS: 45,
    daysAgo: 40,
    contentType: "SHORTS",
  },
  {
    id: "fake-past-2",
    title: "Past short two",
    durationS: 30,
    daysAgo: 20,
    contentType: "SHORTS",
  },
  {
    id: "fake-past-3",
    title: "Past short three",
    durationS: 58,
    daysAgo: 5,
    contentType: "SHORTS",
  },
  {
    id: "fake-past-4",
    title: "Past video four",
    durationS: 150,
    daysAgo: 10,
    contentType: "VIDEO_ON_DEMAND",
  },
  {
    id: "fake-past-long",
    title: "Past long video",
    durationS: 600,
    daysAgo: 15,
    contentType: "VIDEO_ON_DEMAND",
  },
]

const isoDay = (at: Date) => at.toISOString().slice(0, 10)
const addDays = (day: string, days: number) =>
  isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS))

export class YouTubeFake implements YouTubeClient {
  private sessions = new Map<string, string | null>()
  private videos = 0
  private failed = false
  private uploads: { id: string; publishedAt: Date }[] = []

  private published(videoId: string): Date | null {
    const past = FAKE_PAST_UPLOADS.find((upload) => upload.id === videoId)
    if (past) return new Date(Date.now() - past.daysAgo * DAY_MS)
    return (
      this.uploads.find((upload) => upload.id === videoId)?.publishedAt ?? null
    )
  }

  async myChannel() {
    return { channelId: "UC-fake", title: "Fake channel", thumbnailUrl: null }
  }

  async startUpload() {
    const uri = `https://fake.youtube.test/upload/${this.sessions.size + 1}`
    this.sessions.set(uri, null)
    return uri
  }

  async uploadedBytes(_token: string, uploadUri: string) {
    const videoId = this.sessions.get(uploadUri)
    return videoId ? { videoId } : 0
  }

  async uploadFrom(
    _token: string,
    uploadUri: string,
    _file: string,
    _offset: number,
    bytes: number,
    signal: AbortSignal,
    onProgress: (sent: number) => void
  ) {
    signal.throwIfAborted()
    if (process.env.YOUTUBE_FAKE_FAIL_ONCE === "1" && !this.failed) {
      this.failed = true
      throw new AppError("EXTERNAL", "Fake YouTube upload failure")
    }
    const videoId = `fake-${++this.videos}`
    this.sessions.set(uploadUri, videoId)
    this.uploads.unshift({ id: videoId, publishedAt: new Date() })
    onProgress(bytes)
    return { videoId }
  }

  async videoStats(_token: string, videoId: string) {
    return videoId.startsWith("fake-")
      ? {
          views: 1234,
          likes: 56,
          comments: 7,
          title:
            FAKE_PAST_UPLOADS.find((upload) => upload.id === videoId)?.title ??
            "Fake upload",
          privacy: "public" as const,
        }
      : null
  }

  async videoStatsBatch(token: string, videoIds: string[]) {
    if (videoIds.length > 50) {
      throw new AppError("INTERNAL", "videos.list takes at most 50 ids")
    }
    const stats = new Map<string, VideoStats>()
    for (const videoId of videoIds) {
      const found = await this.videoStats(token, videoId)
      if (found) stats.set(videoId, found)
    }
    return stats
  }

  async videoAnalytics() {
    return {
      averageViewDurationS: 11.5,
      averageViewPercentage: 64.2,
      retention: Array.from({ length: 100 }, (_, i) => ({
        ratio: (i + 1) / 100,
        watch: 1 - (0.6 * i) / 99,
      })),
    }
  }

  async uploadsPlaylist() {
    return "UU-fake"
  }

  async playlistPage(
    _token: string,
    _playlistId: string,
    pageToken: string | null
  ) {
    const all = [
      ...this.uploads.map((upload) => upload.id),
      ...FAKE_PAST_UPLOADS.map((upload) => upload.id),
    ]
    const offset = pageToken ? Number(pageToken) : 0
    const next = offset + 2
    return {
      items: all.slice(offset, next).map((videoId) => ({
        videoId,
        publishedAt: this.published(videoId),
      })),
      nextPageToken: next < all.length ? String(next) : null,
      total: all.length,
    }
  }

  async videoDetails(_token: string, videoIds: string[]) {
    if (videoIds.length > 50) {
      throw new AppError("INTERNAL", "videos.list takes at most 50 ids")
    }
    return videoIds.flatMap((videoId) => {
      const publishedAt = this.published(videoId)
      if (!publishedAt) return []
      const past = FAKE_PAST_UPLOADS.find((upload) => upload.id === videoId)
      return [
        {
          videoId,
          title: past?.title ?? "Fake upload",
          publishedAt,
          durationMs: (past?.durationS ?? 30) * 1000,
          privacy: "public" as const,
          uploadStatus: "processed",
        },
      ]
    })
  }

  async videoContentType(_token: string, videoId: string) {
    const past = FAKE_PAST_UPLOADS.find((upload) => upload.id === videoId)
    if (past) return past.contentType
    return this.published(videoId) ? "SHORTS" : null
  }

  async videoDaily(
    _token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyViews[]> {
    const publishedAt = this.published(videoId)
    const publishDay = publishedAt ? isoDay(publishedAt) : startDate
    const k = Number(/(\d)$/.exec(videoId)?.[1] ?? 1)
    const rows: DailyViews[] = []
    const last = addDays(endDate, -2)
    for (
      let day = startDate > publishDay ? startDate : publishDay;
      day <= last;
      day = addDays(day, 1)
    ) {
      const i = Math.round(
        (Date.parse(`${day}T00:00:00Z`) -
          Date.parse(`${publishDay}T00:00:00Z`)) /
          DAY_MS
      )
      const views = k * (i === 0 ? 120 : i === 1 ? 60 : 10)
      rows.push({
        day,
        views,
        estimatedMinutesWatched: views * 0.2,
        likes: Math.floor(views / 10),
        subscribersGained: i === 0 ? k : 0,
      })
    }
    return rows
  }

  async channelDaily(_token: string, startDate: string, endDate: string) {
    const rows: ChannelDay[] = []
    const last = addDays(endDate, -2)
    for (let day = startDate; day <= last; day = addDays(day, 1)) {
      rows.push(
        {
          day,
          contentType: "shorts",
          views: 300,
          estimatedMinutesWatched: 60,
          averageViewDurationS: 12,
          likes: 20,
          comments: 3,
          shares: 2,
          subscribersGained: 5,
          subscribersLost: 1,
        },
        {
          day,
          contentType: "long",
          views: 100,
          estimatedMinutesWatched: 400,
          averageViewDurationS: 240,
          likes: 5,
          comments: 1,
          shares: 0,
          subscribersGained: 2,
          subscribersLost: 0,
        }
      )
    }
    return { split: true, rows }
  }

  async topVideos(
    _token: string,
    startDate: string,
    endDate: string,
    maxResults: number
  ) {
    const days =
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        DAY_MS +
      1
    return [
      ...this.uploads.map((upload) => upload.id),
      ...FAKE_PAST_UPLOADS.map((upload) => upload.id),
    ]
      .map((videoId) => ({
        videoId,
        views: Number(/(\d)$/.exec(videoId)?.[1] ?? 1) * 10 * days,
      }))
      .sort((a, b) => b.views - a.views || a.videoId.localeCompare(b.videoId))
      .slice(0, maxResults)
  }
}
