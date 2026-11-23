import { copyFile, mkdir, stat } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"

import type { DownloadInput, Downloader, VideoInfo } from "./downloader"

const FAKE_HEATMAP = Array.from({ length: 20 }, (_, i) => ({
  startMs: i * 1000,
  endMs: (i + 1) * 1000,
  value: i === 12 ? 1 : 0.2,
}))

export class FakeDownloader implements Downloader {
  readonly id = "fake"

  constructor(private readonly file: string | undefined) {}

  async info(url: string): Promise<VideoInfo> {
    if (url.includes("private")) {
      throw new AppError("VALIDATION", "This video is private")
    }
    return {
      title: "Imported recording",
      language: null,
      durationMs: null,
      isLive: url.includes("live"),
      approxBytes: null,
      thumbnailUrl: null,
      heatmap: url.includes("heatmap") ? FAKE_HEATMAP : [],
    }
  }

  async download({ dir, signal, onProgress }: DownloadInput) {
    if (!this.file) {
      throw new AppError(
        "DEPENDENCY_MISSING",
        "Set FAKE_DOWNLOAD_FILE to use the fake downloader"
      )
    }
    if (signal?.aborted)
      throw new AppError("CANCELLED", "Download was cancelled")
    await mkdir(dir, { recursive: true })
    const target = path.join(dir, `source${path.extname(this.file)}`)
    await copyFile(this.file, target)
    const { size } = await stat(target)
    onProgress?.({
      percent: 100,
      downloadedBytes: size,
      totalBytes: size,
      bytesPerSecond: null,
      etaSeconds: null,
    })
    return target
  }
}
