import "server-only"

import path from "node:path"

import { getEnv } from "@/lib/env"
import { withTransaction } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { getDownloader } from "../../downloads"
import type { JobHandler } from "../../jobs/worker-loop"
import {
  ACCEPTED_VIDEO_TYPES,
  mimeFromFileName,
} from "../../projects/media-type"
import { assetRepository, projectRepository } from "../../projects/repository"
import { projectNameSchema } from "../../projects/schema"
import { beginStep, completeStep, throwIfAborted } from "./common"

export const downloadStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = beginStep(db, job.projectId, "downloading")
  if (project.sourceAssetId) {
    completeStep(db, project.id, "uploaded", "probe")
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
  if (name.success) projects.rename(project.id, name.data)
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
    withTransaction(db, () => {
      const asset = assetRepository(db).create({
        projectId: project.id,
        kind: "source",
        storageKey: sourceKey,
        mime,
        bytes,
      })
      projects.setSourceAsset(project.id, asset.id)
    })
    logger.info({ bytes, mime, downloader: downloader.id }, "downloaded")
  } finally {
    await storage.removePrefix(dirKey)
  }
  completeStep(db, project.id, "uploaded", "probe")
}
