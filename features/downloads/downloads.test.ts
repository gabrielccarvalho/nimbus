import { describe, expect, it, vi } from "vitest"

import type { DownloadProgress } from "./downloader"
import { isPublicUrl, parseVideoUrl, placeholderName } from "./url"
import {
  describeYtDlpError,
  parseHeatmap,
  parseInfo,
  parseProgressLine,
  downloadProgress,
} from "./yt-dlp-parse"

describe("parseVideoUrl", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=abc123#t=10",
      "https://www.youtube.com/watch?v=abc123",
    ],
    ["  youtu.be/abc123 ", "https://youtu.be/abc123"],
    ["http://www.twitch.tv/videos/42", "http://www.twitch.tv/videos/42"],
  ])("accepts %s", (input, expected) => {
    expect(parseVideoUrl(input)).toBe(expected)
  })

  it.each([
    [""],
    ["not a link"],
    ["ftp://example.com/video.mp4"],
    ["file:///etc/passwd"],
    ["javascript:alert(1)"],
    ["http://localhost:3000/video"],
    ["http://127.0.0.1/video"],
    ["http://192.168.1.10/video"],
    ["http://10.0.0.1/video"],
    ["http://[::1]/video"],
    ["http://printer.local/video"],
    [`https://example.com/${"a".repeat(2100)}`],
    [42],
  ])("rejects %j", (input) => {
    expect(() => parseVideoUrl(input)).toThrow("Paste a link to a video")
  })

  it("checks thumbnail links the same way", () => {
    expect(isPublicUrl("https://i.ytimg.com/vi/abc/hq.jpg")).toBe(true)
    expect(isPublicUrl("https://127.0.0.1/hq.jpg")).toBe(false)
  })

  it("names a project from the video id until the title is known", () => {
    expect(placeholderName("https://www.youtube.com/watch?v=abc123")).toBe(
      "youtube.com abc123"
    )
    expect(placeholderName("https://youtu.be/xyz")).toBe("youtu.be xyz")
    expect(placeholderName("https://example.com/")).toBe("example.com")
  })
})

describe("parseInfo", () => {
  it("reads title, duration, live state and size", () => {
    expect(
      parseInfo(
        JSON.stringify({
          title: " My stream ",
          duration: 3725.5,
          live_status: "was_live",
          filesize_approx: 1_500_000_000,
          thumbnail: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
          language: "pt-BR",
          heatmap: [
            { start_time: 37.255, end_time: 74.51, value: 0.42 },
            { start_time: 0, end_time: 37.255, value: 1 },
          ],
        })
      )
    ).toEqual({
      title: "My stream",
      language: "pt-BR",
      durationMs: 3_725_500,
      isLive: false,
      approxBytes: 1_500_000_000,
      thumbnailUrl: "https://i.ytimg.com/vi/abc/maxresdefault.jpg",
      heatmap: [
        { startMs: 0, endMs: 37_255, value: 1 },
        { startMs: 37_255, endMs: 74_510, value: 0.42 },
      ],
    })
  })

  it("flags live and upcoming streams", () => {
    expect(parseInfo('{"is_live":true}').isLive).toBe(true)
    expect(parseInfo('{"live_status":"is_upcoming"}').isLive).toBe(true)
  })

  it("tolerates missing fields", () => {
    expect(parseInfo("{}")).toEqual({
      title: "",
      language: null,
      durationMs: null,
      isLive: false,
      approxBytes: null,
      thumbnailUrl: null,
      heatmap: [],
    })
    expect(
      parseInfo('{"thumbnail":"file:///etc/passwd"}').thumbnailUrl
    ).toBeNull()
  })

  it("skips malformed heatmap points and clamps values", () => {
    expect(
      parseHeatmap([
        { start_time: 10, end_time: 5, value: 0.5 },
        { start_time: "0", end_time: 5, value: 0.5 },
        null,
        { start_time: 0, end_time: 5, value: 1.4 },
      ])
    ).toEqual([{ startMs: 0, endMs: 5000, value: 1 }])
    expect(parseHeatmap(null)).toEqual([])
  })

  it("rejects playlists and garbage", () => {
    expect(() => parseInfo('{"_type":"playlist"}')).toThrow(/single video/)
    expect(() => parseInfo("nope")).toThrow(/unreadable/)
  })
})

describe("progress", () => {
  it("parses progress lines", () => {
    expect(parseProgressLine("progress 50 200 NA 25 6")).toEqual({
      percent: 25,
      downloadedBytes: 50,
      totalBytes: 200,
      bytesPerSecond: 25,
      etaSeconds: 6,
    })
    expect(parseProgressLine("progress 50 NA 100 NA NA")).toMatchObject({
      percent: 50,
      bytesPerSecond: null,
      etaSeconds: null,
    })
    expect(parseProgressLine("progress 10 NA NA")).toBeNull()
    expect(parseProgressLine("[download] Destination: x")).toBeNull()
  })

  it("weights the video stream before the audio stream", () => {
    const onProgress = vi.fn()
    const line = downloadProgress(onProgress)
    line("[download] Destination: dir/source.f137.mp4")
    line("progress 50 100 NA")
    line("progress 100 100 NA")
    line("[download] Destination: dir/source.f140.m4a")
    line("progress 100 100 NA")
    line("[Merger] Merging formats into dir/source.mp4")
    const calls = onProgress.mock.calls.map(([p]) => p as DownloadProgress)
    expect(calls.map((p) => p.percent)).toEqual([45, 90, 100])
    expect(calls.at(-1)).toMatchObject({
      downloadedBytes: 200,
      totalBytes: 200,
    })
  })
})

describe("describeYtDlpError", () => {
  it.each([
    ["ERROR: [youtube] abc: Private video. Sign in", "VALIDATION", /private/],
    [
      "ERROR: [youtube] abc: Join this channel to get access",
      "VALIDATION",
      /members only/,
    ],
    [
      "ERROR: [youtube] abc: Sign in to confirm your age",
      "VALIDATION",
      /age-restricted/,
    ],
    [
      "ERROR: [youtube] abc: Sign in to confirm you’re not a bot",
      "DEPENDENCY_MISSING",
      /YTDLP_COOKIES_FROM_BROWSER/,
    ],
    ["ERROR: HTTP Error 429: Too Many Requests", "EXTERNAL", /rate limiting/],
    ["ERROR: [youtube] abc: Video unavailable", "NOT_FOUND", /unavailable/],
    [
      "ERROR: [youtube] xxxxxxxxxxx: This video is unavailable",
      "NOT_FOUND",
      /unavailable/,
    ],
    [
      "ERROR: [youtube] jNQXAC9IVRw: Something new broke",
      "EXTERNAL",
      /^Download failed: Something new broke$/,
    ],
    ["ERROR: Unsupported URL: https://x.com", "VALIDATION", /isn't a video/],
    [
      "ERROR: Unable to download webpage: <urlopen error getaddrinfo failed>",
      "EXTERNAL",
      /Couldn't reach/,
    ],
    [
      "ERROR: [generic] something odd",
      "EXTERNAL",
      /^Download failed: something odd$/,
    ],
    ["", "EXTERNAL", /^Download failed$/],
  ])("maps %j", (stderr, code, message) => {
    const error = describeYtDlpError(stderr)
    expect(error.code).toBe(code)
    expect(error.message).toMatch(message)
  })

  it("tells the user to refresh cookies when they're already set", () => {
    const error = describeYtDlpError(
      "ERROR: [youtube] abc: Sign in to confirm you're not a bot",
      { withCookies: true }
    )
    expect(error.code).toBe("DEPENDENCY_MISSING")
    expect(error.message).toMatch(/still wants a sign-in/)
  })
})
