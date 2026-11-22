import "server-only"

import { getStorage, storageKeys } from "@/lib/storage"

import type { JobHandler } from "../../jobs/worker-loop"
import { assetRepository } from "../../projects/repository"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { settingsRepository } from "../../settings/repository"
import { getTranscriber } from "../../transcription"
import { buildSegments, normalizeWords } from "../../transcription/normalize"
import { transcriptRepository } from "../../transcription/repository"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

export const transcribeStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = beginStep(db, job.projectId, "transcribing")
  const storage = getStorage()
  const source = sourceAsset(db, project)
  const durationMs = source.durationMs ?? 0
  const audioKey = storageKeys.audio(project.id)

  await runFfmpeg(
    [
      "-i",
      storage.resolve(source.storageKey),
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
  if (!assets.findByKind(project.id, "audio")) {
    assets.create({
      projectId: project.id,
      kind: "audio",
      storageKey: audioKey,
      mime: "audio/wav",
      bytes: (await storage.stat(audioKey))?.bytes ?? 0,
      durationMs,
    })
  }

  const transcriber = getTranscriber()
  const language = settingsRepository(db).get().transcriptionLanguage
  const raw = await transcriber.transcribe({
    audioPath: storage.resolve(audioKey),
    durationMs,
    language,
    signal,
    onProgress: (p) => reportProgress(10 + p * 0.9),
  })
  throwIfAborted(signal)

  const words = normalizeWords(raw.tokens).filter(
    (w) => w.startMs < durationMs || !durationMs
  )
  transcriptRepository(db).save(project.id, {
    language: raw.language,
    words,
    segments: buildSegments(words),
  })
  logger.info(
    { transcriber: transcriber.id, words: words.length },
    "transcribed"
  )
  completeStep(db, project.id, "analyzing", "analyze")
}
