import "server-only"

import { Transform } from "node:stream"

import { getDb, newId, withTransaction } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { readableFromRequestBody } from "@/lib/http/request-body"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

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

export async function projectSettingsFromApp(): Promise<ProjectSettings> {
  const app = await getAppSettings(getDb())
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
  if (Number.isFinite(declaredLength)) {
    await assertDiskSpace(env.DATA_DIR, declaredLength, "store this upload")
  }

  const storage = getStorage()
  const projectId = newId()
  const tempKey = storageKeys.uploadTemp(projectId)
  const sourceKey = storageKeys.source(projectId, ACCEPTED_VIDEO_TYPES[mime])

  const body = readableFromRequestBody(request.body)

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
    const settings = await projectSettingsFromApp()
    await withTransaction(db, async (tx) => {
      await projectRepository(tx).create({
        id: projectId,
        name: projectNameFromFile(fileName),
        settings,
      })
      const asset = await assetRepository(tx).create({
        projectId,
        kind: "source",
        storageKey: sourceKey,
        mime,
        bytes,
      })
      await projectRepository(tx).setSourceAsset(projectId, asset.id)
      await jobQueue(tx).enqueue({ type: "probe", projectId })
    })
  } catch (error) {
    await storage.remove(sourceKey)
    throw error
  }
  logger.info({ projectId, bytes, mime }, "upload stored")
  return { projectId }
}
