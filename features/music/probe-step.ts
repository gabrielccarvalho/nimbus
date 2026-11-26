import "server-only"

import type { Db } from "@/lib/db"
import { AppError, toUserMessage } from "@/lib/errors"
import { getStorage } from "@/lib/storage"

import type { Job } from "../jobs/queue"
import type { JobHandler } from "../jobs/worker-loop"
import { parseAudioProbe } from "../pipeline/steps/probe-parse"
import { runFfmpeg, runFfprobe } from "../render/ffmpeg-runner"
import { peakFold } from "./media"
import { musicRepository } from "./repository"
import { MUSIC_PEAK_BUCKETS } from "./schema"

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

function trackIdOf(job: Job) {
  const trackId = job.payload.trackId
  if (typeof trackId !== "string") {
    throw new AppError("VALIDATION", "Music probe is missing its track")
  }
  return trackId
}

export const probeMusicStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
  reportProgress,
  logger,
}) => {
  const trackId = trackIdOf(job)
  const tracks = musicRepository(db)
  const track = await tracks.get(trackId)
  if (track?.status !== "processing") {
    logger.info({ trackId }, "music track gone or already probed")
    return
  }
  const file = await getStorage().localCopy(track.storageKey, scratch, signal)
  const { durationMs } = parseAudioProbe(
    await runFfprobe(file, signal, "audio")
  )
  reportProgress(50)
  const peaks = await readPeaks(file, durationMs, signal)
  await tracks.update(trackId, { status: "ready", durationMs, peaks })
  logger.info({ trackId, durationMs }, "music track probed")
}

export async function failMusicProbe(db: Db, job: Job, error: AppError) {
  const trackId = job.payload.trackId
  if (typeof trackId !== "string") return
  const tracks = musicRepository(db)
  if ((await tracks.get(trackId))?.status !== "processing") return
  await tracks.update(trackId, {
    status: "failed",
    error: toUserMessage(error),
  })
}
