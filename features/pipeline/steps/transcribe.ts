import "server-only"

import { getStorage, storageKeys } from "@/lib/storage"

import type { JobContext, JobHandler } from "../../jobs/worker-loop"
import { assetRepository, type Project } from "../../projects/repository"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { getTranscriber } from "../../transcription"
import {
  detectionWindows,
  pickLanguage,
  resolveLanguage,
} from "../../transcription/language"
import { buildSegments, normalizeWords } from "../../transcription/normalize"
import { transcriptRepository } from "../../transcription/repository"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

const DETECTION_WINDOW_MS = 30_000

async function chooseLanguage(
  project: Project,
  audioPath: string,
  durationMs: number,
  { signal, logger }: Pick<JobContext, "signal" | "logger">
) {
  const storage = getStorage()
  const resolved = resolveLanguage({
    setting: project.settings.language,
    sourceLanguage: project.sourceLanguage,
  })
  if (resolved) return resolved
  const transcriber = getTranscriber()
  if (!transcriber.multilingual)
    return { language: "en", source: "whisper" } as const
  const sampleKey = storageKeys.languageSample(project.id)
  const samplePath = storage.resolve(sampleKey)
  const votes = []
  try {
    for (const startMs of detectionWindows(durationMs, {
      windowMs: DETECTION_WINDOW_MS,
    })) {
      throwIfAborted(signal)
      await runFfmpeg(
        [
          "-ss",
          String(startMs / 1000),
          "-t",
          String(DETECTION_WINDOW_MS / 1000),
          "-i",
          audioPath,
          "-c",
          "copy",
          samplePath,
        ],
        { signal }
      )
      const vote = await transcriber.detectLanguage({ samplePath, signal })
      if (vote) votes.push(vote)
    }
  } finally {
    await storage.remove(sampleKey)
  }
  const picked = pickLanguage(votes)
  logger.info({ votes, picked }, "detected spoken language")
  return picked
    ? ({ language: picked.language, source: "detected" } as const)
    : ({ language: "auto", source: "whisper" } as const)
}

export const transcribeStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "transcribing")
  const storage = getStorage()
  const source = await sourceAsset(db, project)
  const durationMs = source.durationMs ?? 0
  const audioKey = storageKeys.audio(project.id)
  const track = project.settings.audioTrack
  const trackExists =
    track !== null && (source.audioTracks ?? []).some((t) => t.index === track)
  if (track !== null && !trackExists) {
    logger.warn({ track }, "chosen audio track is missing, using the default")
  }

  await runFfmpeg(
    [
      "-i",
      storage.resolve(source.storageKey),
      ...(trackExists ? ["-map", `0:a:${track}`] : []),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      storage.resolve(audioKey),
    ],
    {
      signal,
      expectedDurationMs: durationMs,
      onProgress: (p) => reportProgress(p * 0.1),
    }
  )
  const assets = assetRepository(db)
  const bytes = (await storage.stat(audioKey))?.bytes ?? 0
  const audio = await assets.findByKind(project.id, "audio")
  if (audio) {
    await assets.update(audio.id, { bytes, durationMs })
  } else {
    await assets.create({
      projectId: project.id,
      kind: "audio",
      storageKey: audioKey,
      mime: "audio/wav",
      bytes,
      durationMs,
    })
  }

  const audioPath = storage.resolve(audioKey)
  const chosen = await chooseLanguage(project, audioPath, durationMs, {
    signal,
    logger,
  })
  reportProgress(15)

  const transcriber = getTranscriber()
  const raw = await transcriber.transcribe({
    audioPath,
    durationMs,
    language: chosen.language,
    signal,
    onProgress: (p) => reportProgress(15 + p * 0.85),
  })
  throwIfAborted(signal)

  const words = normalizeWords(raw.tokens).filter(
    (w) => w.startMs < durationMs || !durationMs
  )
  await transcriptRepository(db).save(project.id, {
    language: raw.language,
    languageSource: chosen.source,
    words,
    segments: buildSegments(words),
  })
  logger.info(
    {
      transcriber: transcriber.id,
      words: words.length,
      language: raw.language,
      languageSource: chosen.source,
    },
    "transcribed"
  )
  await completeStep(db, project.id, "analyzing", "analyze")
}
