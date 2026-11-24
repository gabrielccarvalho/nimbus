import "server-only"

import { createReadStream } from "node:fs"
import { pipeline, Readable, Transform } from "node:stream"

import { AppError } from "@/lib/errors"

import type { YouTubeClient } from "./youtube"

const API = "https://www.googleapis.com"

type GoogleError = {
  error?: { message?: string; errors?: { reason?: string }[] }
}

async function failure(response: Response): Promise<AppError> {
  const body = (await response.json().catch(() => ({}))) as GoogleError
  const reason = body.error?.errors?.[0]?.reason
  const message = body.error?.message ?? `YouTube returned ${response.status}`
  if (response.status === 401) {
    return new AppError("UNAUTHORIZED", "YouTube rejected the access token", {
      cause: "token",
    })
  }
  if (response.status === 403 && reason === "quotaExceeded") {
    return new AppError("EXTERNAL", "YouTube API quota exceeded", {
      cause: "quota",
    })
  }
  if (response.status === 403 && reason === "uploadLimitExceeded") {
    return new AppError(
      "VALIDATION",
      "This channel hit YouTube's own upload limit for today"
    )
  }
  if (response.status >= 400 && response.status < 500) {
    return new AppError("VALIDATION", message)
  }
  return new AppError("EXTERNAL", message)
}

async function send(
  url: string,
  init: RequestInit & { duplex?: "half" }
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new AppError("EXTERNAL", "Could not reach YouTube", { cause: error })
  }
  return response
}

export class YouTubeHttp implements YouTubeClient {
  async myChannel(token: string) {
    const response = await send(
      `${API}/youtube/v3/channels?part=snippet&mine=true`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as {
      items?: {
        id: string
        snippet: {
          title: string
          thumbnails?: { default?: { url?: string } }
        }
      }[]
    }
    const item = body.items?.[0]
    if (!item) {
      throw new AppError(
        "NOT_FOUND",
        "This Google account has no YouTube channel"
      )
    }
    return {
      channelId: item.id,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    }
  }

  async startUpload(token: string, body: object, bytes: number) {
    const response = await send(
      `${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-length": String(bytes),
          "x-upload-content-type": "video/*",
        },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) throw await failure(response)
    const location = response.headers.get("location")
    if (!location) {
      throw new AppError("EXTERNAL", "YouTube did not return an upload URL")
    }
    return location
  }

  async uploadedBytes(token: string, uploadUri: string, bytes: number) {
    const response = await send(uploadUri, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-length": "0",
        "content-range": `bytes */${bytes}`,
      },
    })
    if (response.status === 308) {
      const range = /bytes=0-(\d+)/.exec(response.headers.get("range") ?? "")
      return range ? Number(range[1]) + 1 : 0
    }
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { id: string }
    return { videoId: body.id }
  }

  async uploadFrom(
    token: string,
    uploadUri: string,
    file: string,
    offset: number,
    bytes: number,
    signal: AbortSignal,
    onProgress: (sent: number) => void
  ) {
    let sent = offset
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sent += chunk.length
        onProgress(sent)
        callback(null, chunk)
      },
    })
    const source = createReadStream(file, { start: offset })
    let readError: Error | undefined
    pipeline(source, counter, (error) => {
      if (error && !signal.aborted) readError = error
    })
    let response: Response
    try {
      response = await send(uploadUri, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-length": String(bytes - offset),
          "content-range": `bytes ${offset}-${bytes - 1}/${bytes}`,
        },
        body: Readable.toWeb(counter) as ReadableStream,
        duplex: "half",
        signal,
      })
    } catch (error) {
      if (readError) {
        throw new AppError("STORAGE", "Could not read the clip to upload", {
          cause: readError,
        })
      }
      throw error
    } finally {
      source.destroy()
      counter.destroy()
    }
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { id: string }
    return { videoId: body.id }
  }
}
