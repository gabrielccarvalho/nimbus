import "server-only"

import { getStorage } from "@/lib/storage"

import { createCutParser, cutDetectionFilter } from "../../analysis/cuts"
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
import {
  DETAIL_INTERVAL_MS,
  downsampleMax,
  MAX_DETAIL_SILENCES,
  WAVEFORM_POINTS,
  type StepDetail,
} from "../detail"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const analyzeStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
  reportProgress,
  reportDetail,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "analyzing")
  const storage = getStorage()
  const source = await sourceAsset(db, project)
  const durationMs = source.durationMs ?? 0
  const input =
    project.settings.audioTrack === null
      ? ((await assetRepository(db).findByKind(project.id, "audio")) ?? source)
      : source

  const silences = createSilenceParser()
  const loudness = createLoudnessCollector(LOUDNESS_INTERVAL_MS)
  let lastDetail = 0
  const publish = () => {
    lastDetail = Date.now()
    reportDetail({
      kind: "analyze",
      durationMs,
      analyzedMs: Math.min(durationMs, loudness.analyzedMs()),
      waveform: downsampleMax(loudness.finish(durationMs), WAVEFORM_POINTS),
      silences: silences.found().slice(0, MAX_DETAIL_SILENCES),
    } satisfies StepDetail)
  }
  const inputPath = await storage.localCopy(input.storageKey, scratch, signal)
  await runFfmpeg(
    [
      "-i",
      inputPath,
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
      onProgress: (p) => {
        reportProgress(p * 0.8)
        if (Date.now() - lastDetail >= DETAIL_INTERVAL_MS) publish()
      },
      onStderrLine: (line) => {
        silences.push(line)
        loudness.push(line)
      },
    }
  )
  throwIfAborted(signal)
  publish()

  const cuts = createCutParser()
  const video =
    (await assetRepository(db).findByKind(project.id, "proxy")) ?? source
  const videoPath = await storage.localCopy(video.storageKey, scratch, signal)
  await runFfmpeg(
    ["-i", videoPath, "-an", "-vf", cutDetectionFilter, "-f", "null", "-"],
    {
      signal,
      expectedDurationMs: durationMs,
      onProgress: (p) => reportProgress(80 + p * 0.15),
      onStderrLine: cuts.push,
    }
  )
  throwIfAborted(signal)

  const words = (await transcriptRepository(db).get(project.id))?.words ?? []
  const data = {
    silences: silences.finish(durationMs),
    loudness: loudness.finish(durationMs),
    loudnessIntervalMs: LOUDNESS_INTERVAL_MS,
    speechDensity: computeSpeechDensity(words, durationMs),
    cuts: cuts.finish(durationMs),
  }
  await signalsRepository(db).save(project.id, data)
  logger.info(
    {
      silences: data.silences.length,
      samples: data.loudness.length,
      cuts: data.cuts.length,
    },
    "analyzed"
  )
  await completeStep(db, project.id, "selecting", "select")
}
