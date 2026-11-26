import "server-only"

import { getDb, withTransaction } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage } from "@/lib/storage"
import { headCheck } from "@/lib/storage/common"

import { jobQueue } from "../jobs/queue"
import { getAppSettings } from "../settings/service"
import {
  containerMatchesMime,
  isAcceptedMime,
  MAGIC_BYTES_NEEDED,
  mimeFromFileName,
  projectNameFromFile,
  sniffContainer,
  type AcceptedVideoMime,
} from "./media-type"
import { assetRepository, projectRepository } from "./repository"
import {
  importOptionsSchema,
  type ImportOptions,
  type ProjectSettings,
} from "./schema"

export function parseImportOptions(input: unknown): ImportOptions {
  const parsed = importOptionsSchema.safeParse(input ?? {})
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Invalid import options")
  }
  return parsed.data
}

export function videoUploadMime(upload: {
  fileName: string
  mime: string
  bytes: number
}): AcceptedVideoMime {
  const declared = upload.mime.split(";")[0]!.trim().toLowerCase()
  const mime = isAcceptedMime(declared)
    ? declared
    : mimeFromFileName(upload.fileName)
  if (!mime) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "Upload an MP4, MOV, MKV or WebM video"
    )
  }
  if (upload.bytes > getEnv().MAX_UPLOAD_BYTES) {
    throw new AppError("TOO_LARGE", "This file is larger than the upload limit")
  }
  return mime
}

export function assertVideoHead(head: Uint8Array, mime: AcceptedVideoMime) {
  const container = sniffContainer(head)
  if (!container || !containerMatchesMime(container, mime)) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "This file doesn't look like a supported video (MP4, MOV, MKV or WebM)"
    )
  }
}

export function magicByteCheck(mime: AcceptedVideoMime) {
  return headCheck(MAGIC_BYTES_NEEDED, (head) => assertVideoHead(head, mime))
}

export async function projectSettingsFromApp(
  options: ImportOptions = {},
  workspaceId: string | null = null
): Promise<ProjectSettings> {
  const app = await getAppSettings(getDb(), workspaceId)
  return {
    selectorMode: options.selectorMode ?? app.selectorMode,
    clipMinMs: app.clipMinMs,
    clipMaxMs: app.clipMaxMs,
    targetClipCount: app.targetClipCount,
    captionStyle: app.captionStyle,
    captionsEnabled: app.captionsEnabled,
    language: options.language ?? app.language,
    audioTrack: null,
    renderQuality: app.renderQuality,
    reactionPhrases: app.reactionPhrases,
    niche: app.niche,
    autoEffects: app.autoEffects,
  }
}

export async function createUploadedProject(upload: {
  projectId: string
  sourceKey: string
  fileName: string
  mime: AcceptedVideoMime
  bytes: number
  options?: ImportOptions
  workspaceId: string | null
}): Promise<{ projectId: string }> {
  const { projectId, sourceKey, mime, bytes } = upload
  const db = getDb()
  try {
    const settings = await projectSettingsFromApp(
      upload.options,
      upload.workspaceId
    )
    await withTransaction(db, async (tx) => {
      await projectRepository(tx).create({
        id: projectId,
        workspaceId: upload.workspaceId,
        name: projectNameFromFile(upload.fileName),
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
    await getStorage().remove(sourceKey)
    throw error
  }
  logger.info({ projectId, bytes, mime }, "upload stored")
  return { projectId }
}
