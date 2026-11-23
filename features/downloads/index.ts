import "server-only"

import { getEnv } from "@/lib/env"

import type { Downloader } from "./downloader"
import { FakeDownloader } from "./fake"
import { YtDlpDownloader } from "./yt-dlp"

export function getDownloader(): Downloader {
  const env = getEnv()
  if (env.DOWNLOADER === "fake")
    return new FakeDownloader(env.FAKE_DOWNLOAD_FILE)
  return new YtDlpDownloader({
    binary: env.YTDLP_PATH,
    ffmpeg: env.FFMPEG_PATH,
  })
}
