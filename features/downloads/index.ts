import "server-only"

import { getEnv } from "@/lib/env"

import { exportBrowserCookies } from "./browser-cookies"
import { parseBrowserSpec } from "./chromium-cookies"
import type { Downloader } from "./downloader"
import { FakeDownloader } from "./fake"
import { YtDlpDownloader } from "./yt-dlp"

export function getDownloader(): Downloader {
  const env = getEnv()
  if (env.DOWNLOADER === "fake")
    return new FakeDownloader(env.FAKE_DOWNLOAD_FILE)
  const browser = env.YTDLP_COOKIES_FROM_BROWSER
    ? parseBrowserSpec(env.YTDLP_COOKIES_FROM_BROWSER)
    : null
  return new YtDlpDownloader({
    binary: env.YTDLP_PATH,
    ffmpeg: env.FFMPEG_PATH,
    cookiesFromBrowser: browser ? undefined : env.YTDLP_COOKIES_FROM_BROWSER,
    cookiesFile: env.YTDLP_COOKIES,
    exportCookies: browser ? () => exportBrowserCookies(browser) : undefined,
  })
}
