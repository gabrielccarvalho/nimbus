import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"

import type { DownloadInput, Downloader, VideoInfo } from "./downloader"

export class FakeDownloader implements Downloader {
  readonly id = "fake"

  constructor(private readonly file: string | undefined) {}

  async info(url: string): Promise<VideoInfo> {
    if (url.includes("private")) {
      throw new AppError("VALIDATION", "This video is private")
    }
    return {
      title: "Imported recording",
      durationMs: null,
      isLive: url.includes("live"),
      approxBytes: null,
      thumbnailUrl: null,
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
    onProgress?.(100)
    return target
  }
}
