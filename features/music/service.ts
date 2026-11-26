import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage, type StorageAdapter } from "@/lib/storage"
import { headCheck } from "@/lib/storage/common"

import { jobQueue } from "../jobs/queue"
import { AUDIO_MAGIC_BYTES, sniffAudio, trackInUseMessage } from "./media"
import { musicRepository } from "./repository"
import {
  MUSIC_FORMATS,
  MUSIC_MAX_BYTES,
  toSummary,
  trackTitleSchema,
  type MusicFormat,
  type MusicTrackSummary,
} from "./schema"

const tooLarge = () =>
  new AppError("TOO_LARGE", "Music files can be up to 50 MB")

const notAudio = () =>
  new AppError(
    "UNSUPPORTED_MEDIA",
    "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file"
  )

export function sniffMusic(head: Uint8Array): MusicFormat {
  const format = sniffAudio(head)
  if (!format) throw notAudio()
  return format
}

export function audioCheck() {
  return headCheck(AUDIO_MAGIC_BYTES, sniffMusic)
}

export function musicUploadMime(upload: {
  fileName: string
  mime: string
  bytes: number
}) {
  if (upload.bytes > MUSIC_MAX_BYTES) throw tooLarge()
  if (upload.mime.startsWith("audio/")) return upload.mime
  const ext = upload.fileName.split(".").pop()?.toLowerCase() ?? ""
  if (ext in MUSIC_FORMATS) return MUSIC_FORMATS[ext as MusicFormat]
  throw notAudio()
}

export async function createProcessingTrack(
  db: Db,
  upload: {
    id: string
    workspaceId: string
    userId: string
    title: string
    storageKey: string
    mime: string
    bytes: number
  }
): Promise<MusicTrackSummary> {
  try {
    const track = await withTransaction(db, async (tx) => {
      const created = await musicRepository(tx).create({
        id: upload.id,
        workspaceId: upload.workspaceId,
        title: upload.title,
        storageKey: upload.storageKey,
        mime: upload.mime,
        bytes: upload.bytes,
        status: "processing",
        createdBy: upload.userId,
      })
      await jobQueue(tx).enqueue({
        type: "probe_music",
        projectId: null,
        payload: { trackId: upload.id },
      })
      return created
    })
    logger.info(
      { trackId: upload.id, bytes: upload.bytes, mime: upload.mime },
      "music track stored"
    )
    return toSummary(track, 0)
  } catch (error) {
    await getStorage().remove(upload.storageKey)
    throw error
  }
}

async function trackInWorkspace(
  db: Db,
  workspaceId: string,
  trackId: string,
  lock?: "update"
) {
  const tracks = musicRepository(db)
  const track = lock
    ? await tracks.lock(trackId, lock)
    : await tracks.get(trackId)
  if (!track || track.workspaceId !== workspaceId) {
    throw new AppError("NOT_FOUND", "Track not found")
  }
  return track
}

export async function renameTrack(
  db: Db,
  workspaceId: string,
  trackId: string,
  title: unknown
) {
  const parsed = trackTitleSchema.safeParse(title)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Give the track a name"
    )
  }
  await trackInWorkspace(db, workspaceId, trackId)
  await musicRepository(db).rename(trackId, parsed.data)
}

export async function deleteTrack(
  db: Db,
  storage: StorageAdapter,
  workspaceId: string,
  trackId: string
) {
  const track = await withTransaction(db, async (tx) => {
    const locked = await trackInWorkspace(tx, workspaceId, trackId, "update")
    const using = await musicRepository(tx).clipsUsing(trackId)
    if (using.length > 0) {
      throw new AppError("CONFLICT", trackInUseMessage(using))
    }
    await musicRepository(tx).delete(trackId)
    return locked
  })
  await storage.remove(track.storageKey)
}
