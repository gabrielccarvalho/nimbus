export type VideoInfo = {
  title: string
  durationMs: number | null
  isLive: boolean
  approxBytes: number | null
  thumbnailUrl: string | null
}

export type DownloadInput = {
  url: string
  dir: string
  maxBytes: number
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

export interface Downloader {
  readonly id: string
  info(url: string, signal?: AbortSignal): Promise<VideoInfo>
  download(input: DownloadInput): Promise<string>
}
