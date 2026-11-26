import "server-only"

import { getDb, withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage, type StorageAdapter } from "@/lib/storage"
import { headCheck } from "@/lib/storage/common"
import { withScratch } from "@/lib/storage/scratch"

import { parseAudioProbe } from "../pipeline/steps/probe-parse"
import { runFfmpeg, runFfprobe } from "../render/ffmpeg-runner"
import {
  AUDIO_MAGIC_BYTES,
  peakFold,
  sniffAudio,
  trackInUseMessage,
  trackTitleFromFile,
} from "./media"
import { musicRepository } from "./repository"
import {
  MUSIC_FORMATS,
  MUSIC_MAX_BYTES,
  MUSIC_PEAK_BUCKETS,
  toSummary,
  trackTitleSchema,
  type MusicFormat,
  type MusicTrackSummary,
} from "./schema"

export type MusicActor = { workspaceId: string; userId: string }

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

const PEAK_SAMPLE_RATE = 8000

async function readPeaks(file: string, durationMs: number) {
  const fold = peakFold(
    Math.round((durationMs * PEAK_SAMPLE_RATE) / 1000),
    MUSIC_PEAK_BUCKETS
  )
  await runFfmpeg(
    [
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(PEAK_SAMPLE_RATE),
      "-f",
      "s16le",
      "pipe:1",
    ],
    { timeoutMs: 120_000, onStdoutData: (chunk) => fold.push(chunk) }
  )
  return fold.peaks()
}

export async function finishMusicUpload(
  upload: {
    id: string
    storageKey: string
    format: MusicFormat
    fileName: string
    bytes: number
  },
  actor: MusicActor
): Promise<MusicTrackSummary> {
  const storage = getStorage()
  try {
    const { durationMs, peaks } = await withScratch(
      `music-${upload.id}`,
      async (scratch) => {
        const file = await storage.localCopy(upload.storageKey, scratch)
        const { durationMs } = parseAudioProbe(
          await runFfprobe(file, undefined, "audio")
        )
        return { durationMs, peaks: await readPeaks(file, durationMs) }
      }
    )
    const track = await musicRepository(getDb()).create({
      id: upload.id,
      workspaceId: actor.workspaceId,
      title: trackTitleFromFile(upload.fileName),
      storageKey: upload.storageKey,
      mime: MUSIC_FORMATS[upload.format],
      bytes: upload.bytes,
      durationMs,
      peaks,
      createdBy: actor.userId,
    })
    logger.info(
      { trackId: upload.id, bytes: upload.bytes, format: upload.format },
      "music track stored"
    )
    return toSummary(track, 0)
  } catch (error) {
    await storage.remove(upload.storageKey)
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
