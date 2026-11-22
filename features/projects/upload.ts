import "server-only"

import { Readable, Transform } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"

import { getDb, newId, withTransaction } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage, storageKeys } from "@/lib/storage"

import { jobQueue } from "../jobs/queue"
import { getAppSettings } from "../settings/service"
import {
  ACCEPTED_VIDEO_TYPES,
  containerMatchesMime,
  isAcceptedMime,
  MAGIC_BYTES_NEEDED,
  mimeFromFileName,
  projectNameFromFile,
  sniffContainer,
  type AcceptedVideoMime,
} from "./media-type"
import { assetRepository, projectRepository } from "./repository"
import type { ProjectSettings } from "./schema"

export const UPLOAD_FILENAME_HEADER = "x-file-name"

function magicByteCheck(mime: AcceptedVideoMime) {
  let head = Buffer.alloc(0)
  let verified = false
  const verify = () => {
    const container = sniffContainer(head)
    if (!container || !containerMatchesMime(container, mime)) {
      throw new AppError(
        "UNSUPPORTED_MEDIA",
        "This file doesn't look like a supported video (MP4, MOV, MKV or WebM)"
      )
    }
    verified = true
  }
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!verified) {
        head = Buffer.concat([head, chunk]).subarray(0, MAGIC_BYTES_NEEDED)
        if (head.length >= MAGIC_BYTES_NEEDED) {
          try {
            verify()
          } catch (error) {
            callback(error as Error)
            return
          }
        }
      }
      callback(null, chunk)
    },
    flush(callback) {
      if (verified) {
        callback()
        return
      }
      try {
        verify()
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}

export function projectSettingsFromApp(): ProjectSettings {
  const app = getAppSettings(getDb())
  return {
    selectorMode: app.selectorMode,
    clipMinMs: app.clipMinMs,
    clipMaxMs: app.clipMaxMs,
    targetClipCount: app.targetClipCount,
    captionStyle: app.captionStyle,
    captionsEnabled: app.captionsEnabled,
  }
}

export async function handleUpload(
  request: Request
): Promise<{ projectId: string }> {
  const env = getEnv()
  const rawName = request.headers.get(UPLOAD_FILENAME_HEADER)
  const fileName = rawName ? decodeURIComponent(rawName) : "upload.mp4"
  const declared = (request.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase()
  const mime = isAcceptedMime(declared) ? declared : mimeFromFileName(fileName)
  if (!mime) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "Upload an MP4, MOV, MKV or WebM video"
    )
  }

  const declaredLength = Number(request.headers.get("content-length") ?? NaN)
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > env.MAX_UPLOAD_BYTES
  ) {
    throw new AppError("TOO_LARGE", "This file is larger than the upload limit")
  }
  if (!request.body) throw new AppError("VALIDATION", "The upload was empty")

  const storage = getStorage()
  const projectId = newId()
  const tempKey = storageKeys.uploadTemp(projectId)
  const sourceKey = storageKeys.source(projectId, ACCEPTED_VIDEO_TYPES[mime])

  const body = Readable.fromWeb(
    request.body as unknown as NodeReadableStream<Uint8Array>
  )

  const { bytes } = await storage.write(tempKey, body, {
    maxBytes: env.MAX_UPLOAD_BYTES,
    transforms: [magicByteCheck(mime)],
  })
  if (bytes === 0) {
    await storage.remove(tempKey)
    throw new AppError("VALIDATION", "The upload was empty")
  }

  await storage.move(tempKey, sourceKey)
  const db = getDb()
  try {
    withTransaction(db, () => {
      projectRepository(db).create({
        id: projectId,
        name: projectNameFromFile(fileName),
        settings: projectSettingsFromApp(),
      })
      const asset = assetRepository(db).create({
        projectId,
        kind: "source",
        storageKey: sourceKey,
        mime,
        bytes,
      })
      projectRepository(db).setSourceAsset(projectId, asset.id)
      jobQueue(db).enqueue({ type: "probe", projectId })
    })
  } catch (error) {
    await storage.remove(sourceKey)
    throw error
  }
  logger.info({ projectId, bytes, mime }, "upload stored")
  return { projectId }
}
