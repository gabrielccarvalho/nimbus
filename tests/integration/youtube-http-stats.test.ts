import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { YouTubeHttp } from "@/features/publishing/youtube-http"

import { server } from "../utils/msw"

const VIDEOS = "https://www.googleapis.com/youtube/v3/videos"
const REPORTS = "https://youtubeanalytics.googleapis.com/v2/reports"

const client = new YouTubeHttp()

function googleError(status: number, reason: string) {
  return HttpResponse.json(
    { error: { message: reason, errors: [{ reason }] } },
    { status }
  )
}

describe("videoStats", () => {
  it("parses statistic strings into numbers", async () => {
    server.use(
      http.get(VIDEOS, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("part")).toBe("statistics,snippet,status")
        expect(url.searchParams.get("id")).toBe("abc")
        return HttpResponse.json({
          items: [
            {
              snippet: { title: "Clip" },
              status: { privacyStatus: "unlisted" },
              statistics: {
                viewCount: "1234",
                likeCount: "56",
                commentCount: "7",
              },
            },
          ],
        })
      })
    )
    expect(await client.videoStats("t", "abc")).toEqual({
      views: 1234,
      likes: 56,
      comments: 7,
      title: "Clip",
      privacy: "unlisted",
    })
  })

  it("throws when the response has no status", async () => {
    server.use(
      http.get(VIDEOS, () =>
        HttpResponse.json({ items: [{ snippet: { title: "Clip" } }] })
      )
    )
    await expect(client.videoStats("t", "abc")).rejects.toMatchObject({
      code: "EXTERNAL",
    })
  })

  it("returns null for empty items", async () => {
    server.use(http.get(VIDEOS, () => HttpResponse.json({ items: [] })))
    expect(await client.videoStats("t", "abc")).toBeNull()
  })

  it("returns null for a 404 videoNotFound", async () => {
    server.use(http.get(VIDEOS, () => googleError(404, "videoNotFound")))
    expect(await client.videoStats("t", "abc")).toBeNull()
  })

  it("maps 401 to a token failure", async () => {
    server.use(http.get(VIDEOS, () => googleError(401, "authError")))
    await expect(client.videoStats("t", "abc")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      cause: "token",
    })
  })

  it("maps 403 quotaExceeded to a quota failure", async () => {
    server.use(http.get(VIDEOS, () => googleError(403, "quotaExceeded")))
    await expect(client.videoStats("t", "abc")).rejects.toMatchObject({
      cause: "quota",
    })
  })
})

describe("videoStatsBatch", () => {
  it("reads every id in one request and leaves out the missing ones", async () => {
    let requests = 0
    server.use(
      http.get(VIDEOS, ({ request }) => {
        requests++
        const url = new URL(request.url)
        expect(url.searchParams.get("part")).toBe("statistics,snippet,status")
        expect(url.searchParams.get("id")).toBe("a,b,c")
        return HttpResponse.json({
          items: [
            {
              id: "a",
              snippet: { title: "A" },
              status: { privacyStatus: "public" },
              statistics: {
                viewCount: "10",
                likeCount: "2",
                commentCount: "1",
              },
            },
            {
              id: "c",
              snippet: { title: "C" },
              status: { privacyStatus: "private" },
              statistics: { viewCount: "3" },
            },
          ],
        })
      })
    )
    const stats = await client.videoStatsBatch("t", ["a", "b", "c"])
    expect(requests).toBe(1)
    expect([...stats]).toEqual([
      [
        "a",
        { views: 10, likes: 2, comments: 1, title: "A", privacy: "public" },
      ],
      [
        "c",
        { views: 3, likes: 0, comments: 0, title: "C", privacy: "private" },
      ],
    ])
  })

  it("rejects more than 50 ids before any request", async () => {
    await expect(
      client.videoStatsBatch(
        "t",
        Array.from({ length: 51 }, (_, i) => `v${i}`)
      )
    ).rejects.toMatchObject({ code: "INTERNAL" })
  })
})

describe("videoAnalytics", () => {
  it("reads columns by header name and sends the retention query", async () => {
    const seen: URL[] = []
    server.use(
      http.get(REPORTS, ({ request }) => {
        const url = new URL(request.url)
        seen.push(url)
        if (url.searchParams.get("dimensions")) {
          return HttpResponse.json({
            columnHeaders: [
              { name: "audienceWatchRatio" },
              { name: "elapsedVideoTimeRatio" },
            ],
            rows: [
              [0.9, 0.01],
              [1.2, 0.02],
            ],
          })
        }
        return HttpResponse.json({
          columnHeaders: [
            { name: "averageViewPercentage" },
            { name: "views" },
            { name: "averageViewDuration" },
          ],
          rows: [[64.2, 100, 11.5]],
        })
      })
    )
    const result = await client.videoAnalytics(
      "t",
      "abc",
      "2026-11-01",
      "2026-11-08"
    )
    expect(result).toEqual({
      averageViewDurationS: 11.5,
      averageViewPercentage: 64.2,
      retention: [
        { ratio: 0.01, watch: 0.9 },
        { ratio: 0.02, watch: 1.2 },
      ],
    })
    expect(seen).toHaveLength(2)
    const retention = seen.find((url) => url.searchParams.get("dimensions"))!
    expect(retention.searchParams.get("dimensions")).toBe(
      "elapsedVideoTimeRatio"
    )
    expect(retention.searchParams.get("filters")).toBe("video==abc")
    expect(retention.searchParams.get("ids")).toBe("channel==MINE")
    expect(retention.searchParams.get("startDate")).toBe("2026-11-01")
    expect(retention.searchParams.get("endDate")).toBe("2026-11-08")
  })

  it("returns nulls and an empty curve when rows are missing", async () => {
    server.use(
      http.get(REPORTS, () =>
        HttpResponse.json({ columnHeaders: [{ name: "views" }] })
      )
    )
    expect(
      await client.videoAnalytics("t", "abc", "2026-11-01", "2026-11-08")
    ).toEqual({
      averageViewDurationS: null,
      averageViewPercentage: null,
      retention: [],
    })
  })
})
