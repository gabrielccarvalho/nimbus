import "server-only"

import { mkdir } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { getDownloader } from "../../downloads"
import { isPublicUrl } from "../../downloads/url"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  ACCEPTED_VIDEO_TYPES,
  mimeFromFileName,
} from "../../projects/media-type"
import { assetRepository, projectRepository } from "../../projects/repository"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { projectNameSchema } from "../../projects/schema"
import { beginStep, completeStep, throwIfAborted } from "./common"

async function saveThumbnail(
  db: Db,
  projectId: string,
  url: string,
  signal: AbortSignal
) {
  const assets = assetRepository(db)
  if (await assets.findByKind(projectId, "thumbnail")) return
  const storage = getStorage()
  const key = storageKeys.thumbnail(projectId)
  await mkdir(path.dirname(storage.resolve(key)), { recursive: true })
  await runFfmpeg(
    [
      "-i",
      url,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "4",
      storage.resolve(key),
    ],
    { signal, timeoutMs: 30_000 }
  )
  await assets.create({
    projectId,
    kind: "thumbnail",
    storageKey: key,
    mime: "image/jpeg",
    bytes: (await storage.stat(key))?.bytes ?? 0,
    width: 640,
  })
}

export const downloadStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "downloading")
  if (project.sourceAssetId) {
    await completeStep(db, project.id, "uploaded", "probe")
    return
  }
  if (!project.sourceUrl) {
    throw new AppError("VALIDATION", "This project has no link to download")
  }
  const env = getEnv()
  const storage = getStorage()
  const projects = projectRepository(db)
  const downloader = getDownloader()

  const info = await downloader.info(project.sourceUrl, signal)
  if (info.isLive) {
    throw new AppError(
      "VALIDATION",
      "This is a live stream. Import it once the stream has ended."
    )
  }
  const name = projectNameSchema.safeParse(info.title.slice(0, 120))
  if (name.success) await projects.rename(project.id, name.data)
  if (info.thumbnailUrl && isPublicUrl(info.thumbnailUrl)) {
    await saveThumbnail(db, project.id, info.thumbnailUrl, signal).catch(
      (error: unknown) =>
        logger.warn({ err: error }, "couldn't save the video's thumbnail")
    )
  }
  if (info.approxBytes) {
    if (info.approxBytes > env.MAX_UPLOAD_BYTES) {
      throw new AppError(
        "TOO_LARGE",
        "This video is larger than the upload limit"
      )
    }
    await assertDiskSpace(env.DATA_DIR, info.approxBytes, "download this video")
  }
  reportProgress(2)

  const dirKey = storageKeys.downloadDir(project.id)
  await storage.removePrefix(dirKey)
  try {
    const file = await downloader.download({
      url: project.sourceUrl,
      dir: storage.resolve(dirKey),
      maxBytes: env.MAX_UPLOAD_BYTES,
      signal,
      onProgress: (percent) => reportProgress(2 + percent * 0.98),
    })
    throwIfAborted(signal)
    const mime = mimeFromFileName(file)
    if (!mime) {
      throw new AppError(
        "UNSUPPORTED_MEDIA",
        "The downloaded video isn't in a supported format"
      )
    }
    const sourceKey = storageKeys.source(project.id, ACCEPTED_VIDEO_TYPES[mime])
    await storage.move(`${dirKey}/${path.basename(file)}`, sourceKey)
    const bytes = (await storage.stat(sourceKey))?.bytes ?? 0
    await withTransaction(db, async (tx) => {
      const asset = await assetRepository(tx).create({
        projectId: project.id,
        kind: "source",
        storageKey: sourceKey,
        mime,
        bytes,
      })
      await projectRepository(tx).setSourceAsset(project.id, asset.id)
    })
    logger.info({ bytes, mime, downloader: downloader.id }, "downloaded")
  } finally {
    await storage.removePrefix(dirKey)
  }
  await completeStep(db, project.id, "uploaded", "probe")
}
