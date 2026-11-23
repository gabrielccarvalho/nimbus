import "server-only"

import { getStorage } from "@/lib/storage"

import { computeSpeechDensity } from "../../analysis/density"
import {
  createLoudnessCollector,
  LOUDNESS_INTERVAL_MS,
} from "../../analysis/loudness"
import { signalsRepository } from "../../analysis/repository"
import {
  createSilenceParser,
  SILENCE_MIN_MS,
  SILENCE_NOISE_DB,
} from "../../analysis/silence"
import type { JobHandler } from "../../jobs/worker-loop"
import { assetRepository } from "../../projects/repository"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { transcriptRepository } from "../../transcription/repository"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const analyzeStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "analyzing")
  const storage = getStorage()
  const source = await sourceAsset(db, project)
  const durationMs = source.durationMs ?? 0
  const input =
    (await assetRepository(db).findByKind(project.id, "audio")) ?? source

  const silences = createSilenceParser()
  const loudness = createLoudnessCollector(LOUDNESS_INTERVAL_MS)
  await runFfmpeg(
    [
      "-i",
      storage.resolve(input.storageKey),
      "-vn",
      "-af",
      `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_MS / 1000},ebur128=metadata=0`,
      "-f",
      "null",
      "-",
    ],
    {
      signal,
      expectedDurationMs: durationMs,
      onProgress: (p) => reportProgress(p * 0.95),
      onStderrLine: (line) => {
        silences.push(line)
        loudness.push(line)
      },
    }
  )
  throwIfAborted(signal)

  const words = (await transcriptRepository(db).get(project.id))?.words ?? []
  const data = {
    silences: silences.finish(durationMs),
    loudness: loudness.finish(durationMs),
    loudnessIntervalMs: LOUDNESS_INTERVAL_MS,
    speechDensity: computeSpeechDensity(words, durationMs),
  }
  await signalsRepository(db).save(project.id, data)
  logger.info(
    { silences: data.silences.length, samples: data.loudness.length },
    "analyzed"
  )
  await completeStep(db, project.id, "selecting", "select")
}
