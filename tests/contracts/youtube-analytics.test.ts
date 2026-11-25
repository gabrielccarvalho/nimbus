import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import {
  FAKE_PAST_UPLOADS,
  YouTubeFake,
} from "@/features/publishing/youtube-fake"
import { YouTubeHttp } from "@/features/publishing/youtube-http"

import { server } from "../utils/msw"

const API = "https://www.googleapis.com/youtube/v3"
const REPORTS = "https://youtubeanalytics.googleapis.com/v2/reports"

const client = new YouTubeHttp()

const googleError = (status: number, reason: string) =>
  HttpResponse.json(
    { error: { message: reason, errors: [{ reason }] } },
    { status }
  )

describe("uploadsPlaylist", () => {
  it("reads the uploads playlist of the signed-in channel", async () => {
    server.use(
      http.get(`${API}/channels`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("part")).toBe("contentDetails")
        expect(url.searchParams.get("mine")).toBe("true")
        return HttpResponse.json({
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UU1" } } }],
        })
      })
    )
    expect(await client.uploadsPlaylist("t")).toBe("UU1")
  })
})

describe("playlistPage", () => {
  it("sends a page token only when given and maps items", async () => {
    const seen: URL[] = []
    server.use(
      http.get(`${API}/playlistItems`, ({ request }) => {
        seen.push(new URL(request.url))
        return HttpResponse.json({
          items: [
            {
              contentDetails: {
                videoId: "a",
                videoPublishedAt: "2026-11-01T10:00:00Z",
              },
            },
            { contentDetails: { videoId: "b" } },
          ],
          pageInfo: { totalResults: 7 },
        })
      })
    )
    const first = await client.playlistPage("t", "UU1", null)
    expect(seen[0]!.searchParams.get("maxResults")).toBe("50")
    expect(seen[0]!.searchParams.get("playlistId")).toBe("UU1")
    expect(seen[0]!.searchParams.has("pageToken")).toBe(false)
    expect(first).toEqual({
      items: [
        { videoId: "a", publishedAt: new Date("2026-11-01T10:00:00Z") },
        { videoId: "b", publishedAt: null },
      ],
      nextPageToken: null,
      total: 7,
    })
    await client.playlistPage("t", "UU1", "next")
    expect(seen[1]!.searchParams.get("pageToken")).toBe("next")
  })
})

describe("videoDetails", () => {
  it("joins ids and parses duration and publish date", async () => {
    server.use(
      http.get(`${API}/videos`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("part")).toBe(
          "snippet,contentDetails,status"
        )
        expect(url.searchParams.get("id")).toBe("a,b")
        return HttpResponse.json({
          items: [
            {
              id: "a",
              snippet: { title: "A", publishedAt: "2026-11-01T10:00:00Z" },
              contentDetails: { duration: "PT45S" },
              status: { privacyStatus: "public", uploadStatus: "processed" },
            },
          ],
        })
      })
    )
    expect(await client.videoDetails("t", ["a", "b"])).toEqual([
      {
        videoId: "a",
        title: "A",
        publishedAt: new Date("2026-11-01T10:00:00Z"),
        durationMs: 45_000,
        privacy: "public",
        uploadStatus: "processed",
      },
    ])
  })

  it("skips items without a status", async () => {
    server.use(
      http.get(`${API}/videos`, () =>
        HttpResponse.json({
          items: [
            {
              id: "a",
              snippet: { title: "A", publishedAt: "2026-11-01T10:00:00Z" },
            },
            {
              id: "b",
              snippet: { title: "B", publishedAt: "2026-11-01T10:00:00Z" },
              status: { privacyStatus: "public" },
            },
          ],
        })
      )
    )
    expect(await client.videoDetails("t", ["a", "b"])).toEqual([])
  })

  it("rejects more than 50 ids before any request", async () => {
    const hit = vi.fn()
    server.use(
      http.get(`${API}/videos`, () => {
        hit()
        return HttpResponse.json({ items: [] })
      })
    )
    const ids = Array.from({ length: 51 }, (_, i) => `v${i}`)
    await expect(client.videoDetails("t", ids)).rejects.toMatchObject({
      code: "INTERNAL",
    })
    expect(hit).not.toHaveBeenCalled()
  })
})

describe("videoContentType", () => {
  it("returns the content type of the video", async () => {
    server.use(
      http.get(REPORTS, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("dimensions")).toBe("creatorContentType")
        expect(url.searchParams.get("metrics")).toBe("views")
        expect(url.searchParams.get("filters")).toBe("video==abc")
        return HttpResponse.json({
          columnHeaders: [{ name: "creatorContentType" }, { name: "views" }],
          rows: [["SHORTS", 10]],
        })
      })
    )
    expect(
      await client.videoContentType("t", "abc", "2026-11-01", "2026-11-08")
    ).toBe("SHORTS")
  })

  it("returns null without rows", async () => {
    server.use(
      http.get(REPORTS, () =>
        HttpResponse.json({ columnHeaders: [{ name: "creatorContentType" }] })
      )
    )
    expect(
      await client.videoContentType("t", "abc", "2026-11-01", "2026-11-08")
    ).toBeNull()
  })

  it("maps a 400 to a validation error", async () => {
    server.use(http.get(REPORTS, () => googleError(400, "badRequest")))
    await expect(
      client.videoContentType("t", "abc", "2026-11-01", "2026-11-08")
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })
})

describe("videoDaily", () => {
  it("maps reordered columns by header name", async () => {
    server.use(
      http.get(REPORTS, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("dimensions")).toBe("day")
        expect(url.searchParams.get("filters")).toBe("video==abc")
        expect(url.searchParams.get("sort")).toBe("day")
        return HttpResponse.json({
          columnHeaders: [
            { name: "likes" },
            { name: "day" },
            { name: "subscribersGained" },
            { name: "views" },
            { name: "estimatedMinutesWatched" },
          ],
          rows: [[3, "2026-11-01", 1, 120, 24.5]],
        })
      })
    )
    expect(
      await client.videoDaily("t", "abc", "2026-11-01", "2026-11-08")
    ).toEqual([
      {
        day: "2026-11-01",
        views: 120,
        estimatedMinutesWatched: 24.5,
        likes: 3,
        subscribersGained: 1,
      },
    ])
  })
})

describe("missing day column", () => {
  it("throws for videoDaily and channelDaily", async () => {
    server.use(
      http.get(REPORTS, () =>
        HttpResponse.json({
          columnHeaders: [{ name: "views" }],
          rows: [[1]],
        })
      )
    )
    await expect(
      client.videoDaily("t", "abc", "2026-11-01", "2026-11-08")
    ).rejects.toMatchObject({ code: "EXTERNAL" })
    await expect(
      client.channelDaily("t", "2026-11-01", "2026-11-08")
    ).rejects.toMatchObject({ code: "EXTERNAL" })
  })
})

describe("channelDaily", () => {
  const headers = [
    "day",
    "creatorContentType",
    "views",
    "estimatedMinutesWatched",
    "averageViewDuration",
    "likes",
    "comments",
    "shares",
    "subscribersGained",
    "subscribersLost",
  ].map((name) => ({ name }))

  it("maps content types and sums rows that share a type", async () => {
    server.use(
      http.get(REPORTS, ({ request }) => {
        expect(new URL(request.url).searchParams.get("dimensions")).toBe(
          "day,creatorContentType"
        )
        return HttpResponse.json({
          columnHeaders: headers,
          rows: [
            ["2026-11-01", "SHORTS", 300, 60, 12, 20, 3, 2, 5, 1],
            ["2026-11-01", "VIDEO_ON_DEMAND", 100, 400, 240, 5, 1, 0, 2, 0],
            ["2026-11-01", "LIVE_STREAM", 10, 5, 100, 1, 0, 0, 0, 0],
            ["2026-11-01", "STORY", 30, 5, 20, 1, 1, 0, 1, 0],
          ],
        })
      })
    )
    const { split, rows } = await client.channelDaily(
      "t",
      "2026-11-01",
      "2026-11-08"
    )
    expect(split).toBe(true)
    expect(rows.map((row) => row.contentType)).toEqual([
      "shorts",
      "long",
      "other",
    ])
    expect(rows[0]).toMatchObject({ views: 300, averageViewDurationS: 12 })
    expect(rows[2]).toMatchObject({
      views: 40,
      estimatedMinutesWatched: 10,
      likes: 2,
      comments: 1,
      subscribersGained: 1,
      averageViewDurationS: 40,
    })
  })

  it("retries once without the content type on a 400", async () => {
    const dimensions: (string | null)[] = []
    server.use(
      http.get(REPORTS, ({ request }) => {
        const value = new URL(request.url).searchParams.get("dimensions")
        dimensions.push(value)
        if (value === "day,creatorContentType") {
          return googleError(400, "badRequest")
        }
        return HttpResponse.json({
          columnHeaders: headers.filter(
            (header) => header.name !== "creatorContentType"
          ),
          rows: [["2026-11-01", 400, 460, 60, 25, 4, 2, 7, 1]],
        })
      })
    )
    const result = await client.channelDaily("t", "2026-11-01", "2026-11-08")
    expect(dimensions).toEqual(["day,creatorContentType", "day"])
    expect(result.split).toBe(false)
    expect(result.rows).toEqual([
      {
        day: "2026-11-01",
        contentType: "other",
        views: 400,
        estimatedMinutesWatched: 460,
        averageViewDurationS: 60,
        likes: 25,
        comments: 4,
        shares: 2,
        subscribersGained: 7,
        subscribersLost: 1,
      },
    ])
  })

  it("does not retry on a token failure", async () => {
    server.use(http.get(REPORTS, () => googleError(401, "authError")))
    await expect(
      client.channelDaily("t", "2026-11-01", "2026-11-08")
    ).rejects.toMatchObject({ cause: "token" })
  })
})

describe("fake", () => {
  it("pages its uploads two at a time", async () => {
    const fake = new YouTubeFake()
    const ids: string[] = []
    let token: string | null = null
    do {
      const page = await fake.playlistPage("t", "UU-fake", token)
      ids.push(...page.items.map((item) => item.videoId))
      token = page.nextPageToken
    } while (token)
    expect(ids).toEqual(FAKE_PAST_UPLOADS.map((upload) => upload.id))
  })

  it("returns daily views from the publish day to two days before the end", async () => {
    const fake = new YouTubeFake()
    const day = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
    const rows = await fake.videoDaily("t", "fake-past-3", day(30), day(0))
    expect(rows.map((row) => row.day)).toEqual([day(5), day(4), day(3), day(2)])
    expect(rows.map((row) => row.views)).toEqual([360, 180, 30, 30])
    expect(rows[0]).toMatchObject({
      estimatedMinutesWatched: 72,
      likes: 36,
      subscribersGained: 3,
    })
  })
})
