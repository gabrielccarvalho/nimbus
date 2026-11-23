import type { AudiencePoint } from "../analysis/schema"

export type VideoInfo = {
  title: string
  language: string | null
  durationMs: number | null
  isLive: boolean
  approxBytes: number | null
  thumbnailUrl: string | null
  heatmap: AudiencePoint[]
}

export type DownloadInput = {
  url: string
  dir: string
  maxBytes: number
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}

export type DownloadProgress = {
  percent: number
  downloadedBytes: number
  totalBytes: number | null
  bytesPerSecond: number | null
  etaSeconds: number | null
}

export interface Downloader {
  readonly id: string
  info(url: string, signal?: AbortSignal): Promise<VideoInfo>
  download(input: DownloadInput): Promise<string>
}
