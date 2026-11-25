import "server-only"

import { getEnv } from "@/lib/env"

import type { RetentionPoint } from "./stats"
import { YouTubeFake } from "./youtube-fake"
import { YouTubeHttp } from "./youtube-http"

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
  videoStats(
    token: string,
    videoId: string
  ): Promise<{ views: number; likes: number; comments: number } | null>
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
}

let fake: YouTubeFake | undefined

export function getYouTubeClient(): YouTubeClient {
  if (getEnv().YOUTUBE_CLIENT === "fake") return (fake ??= new YouTubeFake())
  return new YouTubeHttp()
}
