import "server-only"

import { getEnv } from "@/lib/env"

import type {
  ChannelDay,
  DailyViews,
  VideoDetails,
} from "@/features/analytics/schema"
import type { TrendingVideo } from "@/features/music/schema"

import type { PrivacyStatus } from "./schema"
import type { RetentionPoint } from "./stats"
import { YouTubeFake } from "./youtube-fake"
import { YouTubeHttp } from "./youtube-http"

export type VideoStats = {
  views: number
  likes: number
  comments: number
  title: string
  privacy: PrivacyStatus
}

export interface YouTubeClient {
  myChannel(
    token: string
  ): Promise<{ channelId: string; title: string; thumbnailUrl: string | null }>
  startUpload(token: string, body: object, bytes: number): Promise<string>
  uploadedBytes(
    token: string,
    uploadUri: string,
    bytes: number
  ): Promise<number | { videoId: string }>
  uploadFrom(
    token: string,
    uploadUri: string,
    file: string,
    offset: number,
    bytes: number,
    signal: AbortSignal,
    onProgress: (sent: number) => void
  ): Promise<{ videoId: string }>
  videoStats(token: string, videoId: string): Promise<VideoStats | null>
  videoStatsBatch(
    token: string,
    videoIds: string[]
  ): Promise<Map<string, VideoStats>>
  videoAnalytics(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    averageViewDurationS: number | null
    averageViewPercentage: number | null
    retention: RetentionPoint[]
  }>
  uploadsPlaylist(token: string): Promise<string>
  playlistPage(
    token: string,
    playlistId: string,
    pageToken: string | null
  ): Promise<{
    items: { videoId: string; publishedAt: Date | null }[]
    nextPageToken: string | null
    total: number
  }>
  videoDetails(token: string, videoIds: string[]): Promise<VideoDetails[]>
  videoContentType(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<string | null>
  videoDaily(
    token: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyViews[]>
  channelDaily(
    token: string,
    startDate: string,
    endDate: string
  ): Promise<{ split: boolean; rows: ChannelDay[] }>
  topVideos(
    token: string,
    startDate: string,
    endDate: string,
    maxResults: number
  ): Promise<{ videoId: string; views: number }[]>
  trendingMusic(
    token: string,
    regionCode: string,
    maxResults: number
  ): Promise<TrendingVideo[]>
}

let fake: YouTubeFake | undefined

export function getYouTubeClient(): YouTubeClient {
  if (getEnv().YOUTUBE_CLIENT === "fake") return (fake ??= new YouTubeFake())
  return new YouTubeHttp()
}
