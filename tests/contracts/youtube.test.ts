import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { http, HttpResponse } from "msw"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { YouTubeClient } from "@/features/publishing/youtube"
import { YouTubeFake } from "@/features/publishing/youtube-fake"
import { YouTubeHttp } from "@/features/publishing/youtube-http"

import { server } from "../utils/msw"

const API = "https://www.googleapis.com"
const SESSION = "https://upload.youtube.test/session/abc"
const SIZE = 600_000

let dir: string
let file: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "youtube-"))
  file = path.join(dir, "clip.mp4")
  await writeFile(file, Buffer.alloc(SIZE, 1))
})
afterAll(() => rm(dir, { recursive: true, force: true }))

const googleError = (status: number, reason: string, message = "nope") =>
  HttpResponse.json(
    { error: { code: status, message, errors: [{ reason }] } },
    { status }
  )

describe.each([
  ["http", () => new YouTubeHttp()],
  ["fake", () => new YouTubeFake()],
])("%s YouTube client contract", (name, create) => {
  if (name === "http") {
    beforeEach(() => {
      server.use(
        http.get(`${API}/youtube/v3/channels`, () =>
          HttpResponse.json({
            items: [
              {
                id: "UC1",
                snippet: {
                  title: "Gabe",
                  thumbnails: { default: { url: "https://img/x.jpg" } },
                },
              },
            ],
          })
        ),
        http.post(
          `${API}/upload/youtube/v3/videos`,
          () => new HttpResponse(null, { headers: { Location: SESSION } })
        ),
        http.put(SESSION, async ({ request }) => {
          const range = request.headers.get("content-range")!
          if (range.startsWith("bytes */")) {
            return new HttpResponse(null, {
              status: 308,
              headers: { Range: "bytes=0-524287" },
            })
          }
          await request.arrayBuffer()
          return HttpResponse.json({ id: "vid1" }, { status: 200 })
        })
      )
    })
  }

  it("returns the channel", async () => {
    const channel = await create().myChannel("tok")
    expect(channel.channelId).toBeTruthy()
    expect(channel.title).toBeTruthy()
  })

  it("starts an upload session and reports its progress", async () => {
    const client = create()
    const uri = await client.startUpload("tok", { snippet: {} }, SIZE)
    expect(uri).toBeTruthy()
    const offset = await client.uploadedBytes("tok", uri, SIZE)
    expect(typeof offset === "number" ? offset : -1).toBeGreaterThanOrEqual(0)
  })

  it("uploads from an offset and reports progress", async () => {
    const client = create()
    const uri = await client.startUpload("tok", { snippet: {} }, SIZE)
    const sent: number[] = []
    const result = await client.uploadFrom(
      "tok",
      uri,
      file,
      524_288,
      SIZE,
      new AbortController().signal,
      (n) => sent.push(n)
    )
    expect(result.videoId).toBeTruthy()
    expect(sent.at(-1)).toBe(SIZE)
  })
})

describe("http YouTube client", () => {
  const client = () => new YouTubeHttp()

  it("reads the channel snippet", async () => {
    server.use(
      http.get(`${API}/youtube/v3/channels`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("mine")).toBe("true")
        expect(request.headers.get("authorization")).toBe("Bearer tok")
        return HttpResponse.json({
          items: [{ id: "UC1", snippet: { title: "Gabe", thumbnails: {} } }],
        })
      })
    )
    await expect(client().myChannel("tok")).resolves.toEqual({
      channelId: "UC1",
      title: "Gabe",
      thumbnailUrl: null,
    })
  })

  it("starts a resumable session and returns the Location", async () => {
    server.use(
      http.post(`${API}/upload/youtube/v3/videos`, async ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("uploadType")).toBe("resumable")
        expect(url.searchParams.get("part")).toBe("snippet,status")
        expect(request.headers.get("x-upload-content-length")).toBe("42")
        expect(await request.json()).toEqual({ snippet: { title: "t" } })
        return new HttpResponse(null, { headers: { Location: SESSION } })
      })
    )
    await expect(
      client().startUpload("tok", { snippet: { title: "t" } }, 42)
    ).resolves.toBe(SESSION)
  })

  it("parses the Range of a 308 into the next offset", async () => {
    server.use(
      http.put(SESSION, ({ request }) => {
        expect(request.headers.get("content-range")).toBe("bytes */1000000")
        return new HttpResponse(null, {
          status: 308,
          headers: { Range: "bytes=0-524287" },
        })
      })
    )
    await expect(
      client().uploadedBytes("tok", SESSION, 1_000_000)
    ).resolves.toBe(524_288)
  })

  it("treats a 308 without Range as nothing received", async () => {
    server.use(http.put(SESSION, () => new HttpResponse(null, { status: 308 })))
    await expect(client().uploadedBytes("tok", SESSION, SIZE)).resolves.toBe(0)
  })

  it("treats a 200 as already uploaded", async () => {
    server.use(http.put(SESSION, () => HttpResponse.json({ id: "vid9" })))
    await expect(client().uploadedBytes("tok", SESSION, SIZE)).resolves.toEqual(
      { videoId: "vid9" }
    )
  })

  it("sends the remainder with a Content-Range", async () => {
    let received = 0
    server.use(
      http.put(SESSION, async ({ request }) => {
        expect(request.headers.get("content-range")).toBe(
          `bytes 524288-${SIZE - 1}/${SIZE}`
        )
        received = (await request.arrayBuffer()).byteLength
        return HttpResponse.json({ id: "vid2" })
      })
    )
    const result = await client().uploadFrom(
      "tok",
      SESSION,
      file,
      524_288,
      SIZE,
      new AbortController().signal,
      () => {}
    )
    expect(result).toEqual({ videoId: "vid2" })
    expect(received).toBe(SIZE - 524_288)
  })

  it("aborts an upload in flight", async () => {
    server.use(
      http.put(SESSION, async ({ request }) => {
        await request.arrayBuffer().catch(() => null)
        return HttpResponse.json({ id: "late" })
      })
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      client().uploadFrom(
        "tok",
        SESSION,
        file,
        0,
        SIZE,
        controller.signal,
        () => {}
      )
    ).rejects.toThrow()
  })

  it("maps 401 to a token error", async () => {
    server.use(
      http.get(`${API}/youtube/v3/channels`, () =>
        googleError(401, "authError")
      )
    )
    await expect(client().myChannel("bad")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      cause: "token",
    })
  })

  it("maps quotaExceeded to a quota error", async () => {
    server.use(
      http.post(`${API}/upload/youtube/v3/videos`, () =>
        googleError(403, "quotaExceeded")
      )
    )
    await expect(client().startUpload("tok", {}, 1)).rejects.toMatchObject({
      code: "EXTERNAL",
      cause: "quota",
    })
  })

  it("maps uploadLimitExceeded to a conflict", async () => {
    server.use(
      http.post(`${API}/upload/youtube/v3/videos`, () =>
        googleError(403, "uploadLimitExceeded")
      )
    )
    await expect(client().startUpload("tok", {}, 1)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This channel hit YouTube's own upload limit for today",
    })
  })

  it("maps other 4xx to a validation error with YouTube's message", async () => {
    server.use(
      http.post(`${API}/upload/youtube/v3/videos`, () =>
        googleError(400, "invalidTitle", "Title is invalid")
      )
    )
    await expect(client().startUpload("tok", {}, 1)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Title is invalid",
    })
  })

  it("maps 5xx and network errors to external", async () => {
    server.use(
      http.get(`${API}/youtube/v3/channels`, () =>
        HttpResponse.text("boom", { status: 503 })
      )
    )
    await expect(client().myChannel("tok")).rejects.toMatchObject({
      code: "EXTERNAL",
    })
    server.use(
      http.get(`${API}/youtube/v3/channels`, () => HttpResponse.error())
    )
    await expect(client().myChannel("tok")).rejects.toMatchObject({
      code: "EXTERNAL",
    })
  })
})

describe("fake YouTube client", () => {
  it("numbers videos and fails the first upload when asked", async () => {
    process.env.YOUTUBE_FAKE_FAIL_ONCE = "1"
    try {
      const client: YouTubeClient = new YouTubeFake()
      const uri = await client.startUpload("tok", {}, SIZE)
      const args = [
        "tok",
        uri,
        file,
        0,
        SIZE,
        new AbortController().signal,
        () => {},
      ] as const
      await expect(client.uploadFrom(...args)).rejects.toMatchObject({
        code: "EXTERNAL",
      })
      await expect(client.uploadFrom(...args)).resolves.toEqual({
        videoId: "fake-1",
      })
      await expect(client.uploadedBytes("tok", uri, SIZE)).resolves.toEqual({
        videoId: "fake-1",
      })
    } finally {
      delete process.env.YOUTUBE_FAKE_FAIL_ONCE
    }
  })
})
