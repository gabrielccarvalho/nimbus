import "server-only"

import { AppError } from "@/lib/errors"

import type { YouTubeClient } from "./youtube"

export class YouTubeFake implements YouTubeClient {
  private sessions = new Map<string, string | null>()
  private videos = 0
  private failed = false

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
    onProgress(bytes)
    return { videoId }
  }

  async videoStats(_token: string, videoId: string) {
    return videoId.startsWith("fake-")
      ? { views: 1234, likes: 56, comments: 7 }
      : null
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
}
