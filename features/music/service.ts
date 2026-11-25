import "server-only"

import { Transform } from "node:stream"

import { getDb, newId, withTransaction, type Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { AppError, isAppError } from "@/lib/errors"
import { readableFromRequestBody } from "@/lib/http/request-body"
import { logger } from "@/lib/logger"
import { getStorage, storageKeys, type StorageAdapter } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { parseAudioProbe } from "../pipeline/steps/probe-parse"
import { UPLOAD_FILENAME_HEADER } from "../projects/upload"
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

function audioSniffer(onFormat: (format: MusicFormat) => void) {
  let head = Buffer.alloc(0)
  let sniffed = false
  const sniff = () => {
    const format = sniffAudio(head)
    if (!format) throw notAudio()
    onFormat(format)
    sniffed = true
  }
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!sniffed) {
        head = Buffer.concat([head, chunk]).subarray(0, AUDIO_MAGIC_BYTES)
        if (head.length >= AUDIO_MAGIC_BYTES) {
          try {
            sniff()
          } catch (error) {
            callback(error as Error)
            return
          }
        }
      }
      callback(null, chunk)
    },
    flush(callback) {
      try {
        if (head.length === 0) {
          throw new AppError("VALIDATION", "The upload was empty")
        }
        if (!sniffed) sniff()
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}

const PEAK_SAMPLE_RATE = 8000

async function readPeaks(
  file: string,
  durationMs: number,
  signal: AbortSignal
) {
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
    { signal, timeoutMs: 120_000, onStdoutData: (chunk) => fold.push(chunk) }
  )
  return fold.peaks()
}

export async function handleMusicUpload(
  request: Request,
  actor: MusicActor
): Promise<MusicTrackSummary> {
  const env = getEnv()
  const rawName = request.headers.get(UPLOAD_FILENAME_HEADER)
  const fileName = rawName ? decodeURIComponent(rawName) : ""
  const declaredLength = Number(request.headers.get("content-length") ?? NaN)
  if (Number.isFinite(declaredLength) && declaredLength > MUSIC_MAX_BYTES) {
    throw tooLarge()
  }
  if (!request.body) throw new AppError("VALIDATION", "The upload was empty")
  await assertDiskSpace(
    env.DATA_DIR,
    Number.isFinite(declaredLength) ? declaredLength : MUSIC_MAX_BYTES,
    "store this upload"
  )

  const storage = getStorage()
  const id = newId()
  const tempKey = storageKeys.uploadTemp(id)
  let format: MusicFormat | undefined
  let storedKey: string | undefined
  try {
    const { bytes } = await storage
      .write(tempKey, readableFromRequestBody(request.body), {
        maxBytes: MUSIC_MAX_BYTES,
        transforms: [audioSniffer((sniffed) => (format = sniffed))],
      })
      .catch((error: unknown) => {
        throw isAppError(error) && error.code === "TOO_LARGE"
          ? tooLarge()
          : error
      })
    if (!format) throw notAudio()

    const file = storage.resolve(tempKey)
    const { durationMs } = parseAudioProbe(
      await runFfprobe(file, request.signal, "audio")
    )
    const peaks = await readPeaks(file, durationMs, request.signal)

    storedKey = storageKeys.music(actor.workspaceId, id, format)
    await storage.move(tempKey, storedKey)
    const track = await musicRepository(getDb()).create({
      id,
      workspaceId: actor.workspaceId,
      title: trackTitleFromFile(fileName),
      storageKey: storedKey,
      mime: MUSIC_FORMATS[format],
      bytes,
      durationMs,
      peaks,
      createdBy: actor.userId,
    })
    logger.info({ trackId: id, bytes, format }, "music track stored")
    return toSummary(track, 0)
  } catch (error) {
    await storage.remove(tempKey)
    if (storedKey) await storage.remove(storedKey)
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
