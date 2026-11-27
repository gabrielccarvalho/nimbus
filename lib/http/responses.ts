import "server-only"

import type { Readable } from "node:stream"

import { toAppError, toUserMessage, type AppErrorCode } from "@/lib/errors"
import { translateRequestError } from "@/lib/i18n/request-error"
import { logger } from "@/lib/logger"
import type { StorageAdapter } from "@/lib/storage/types"

import { mimeForKey, parseRange } from "./range"

const STATUS_BY_CODE: Partial<Record<AppErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  STORAGE: 400,
  CANCELLED: 499,
}

export function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) controller.close()
        else controller.enqueue(new Uint8Array(value))
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      stream.destroy()
    },
  })
}

export async function errorResponse(
  error: unknown,
  context: Record<string, unknown> = {}
) {
  const appError = toAppError(error)
  const status = STATUS_BY_CODE[appError.code] ?? 500
  if (status >= 500)
    logger.error({ err: appError, ...context }, "request failed")
  const message = await translateRequestError(toUserMessage(appError))
  return Response.json({ error: { code: appError.code, message } }, { status })
}

export async function fileResponse(
  request: Request,
  storage: StorageAdapter,
  key: string,
  options: { download?: string } = {}
): Promise<Response> {
  const signed = await storage.readUrl(key, { download: options.download })
  if (signed) {
    return new Response(null, {
      status: 302,
      headers: { Location: signed, "Cache-Control": "private, max-age=0" },
    })
  }

  const info = await storage.stat(key)
  if (!info) return new Response("Not found", { status: 404 })

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": mimeForKey(key),
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Last-Modified": new Date(info.mtimeMs).toUTCString(),
    "X-Content-Type-Options": "nosniff",
  })
  if (options.download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(options.download)}`
    )
  }

  const range = parseRange(request.headers.get("range"), info.bytes)
  if (range.kind === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${info.bytes}`)
    return new Response(null, { status: 416, headers })
  }

  const head = request.method === "HEAD"
  if (range.kind === "full") {
    headers.set("Content-Length", String(info.bytes))
    const body = head ? null : toWebStream(storage.read(key))
    return new Response(body, { status: 200, headers })
  }

  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${info.bytes}`
  )
  headers.set("Content-Length", String(range.end - range.start + 1))
  const body = head ? null : toWebStream(storage.read(key, range))
  return new Response(body, { status: 206, headers })
}
