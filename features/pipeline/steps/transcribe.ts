import "server-only"

import { randomUUID } from "node:crypto"
import { link, rm } from "node:fs/promises"
import path from "node:path"

import { getStorage, storageKeys } from "@/lib/storage"

import { resolveGroqKey } from "../../accounts/usage"
import type { JobContext, JobHandler } from "../../jobs/worker-loop"
import { assetRepository, type Project } from "../../projects/repository"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { getTranscriber } from "../../transcription"
import {
  skipReason,
  type RawTranscript,
  type Transcriber,
} from "../../transcription/transcriber"
import {
  detectionWindows,
  pickLanguage,
  resolveLanguage,
} from "../../transcription/language"
import {
  buildSegments,
  normalizeWords,
  type RawToken,
} from "../../transcription/normalize"
import { transcriptRepository } from "../../transcription/repository"
import type { SkipReason, Word } from "../../transcription/schema"
import { textTail, type StepDetail } from "../detail"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"

const DETECTION_WINDOW_MS = 30_000

async function chooseLanguage(
  project: Project,
  transcriber: Transcriber,
  audioPath: string,
  durationMs: number,
  { signal, scratch, logger }: Pick<JobContext, "signal" | "scratch" | "logger">
) {
  const resolved = resolveLanguage({
    setting: project.settings.language,
    sourceLanguage: project.sourceLanguage,
  })
  if (resolved) return resolved
  const samplePath = path.join(scratch, `language-sample-${randomUUID()}.wav`)
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
    await rm(samplePath, { force: true })
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
  scratch,
  reportProgress,
  reportDetail,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "transcribing")
  const live: Extract<StepDetail, { kind: "transcribe" }> = {
    kind: "transcribe",
    phase: "extracting",
    language: null,
    languageSource: null,
    text: "",
    words: 0,
    audioMs: 0,
  }
  reportDetail(live)
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

  const sourcePath = await storage.localCopy(source.storageKey, scratch, signal)
  const audioPath = path.join(scratch, "audio.wav")
  await runFfmpeg(
    [
      "-i",
      sourcePath,
      ...(trackExists ? ["-map", `0:a:${track}`] : []),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ],
    {
      signal,
      expectedDurationMs: durationMs,
      onProgress: (p) => reportProgress(p * 0.1),
    }
  )
  // A second link keeps the local copy for transcription while putFile takes
  // the other, so S3 doesn't download what was just uploaded.
  const upload = path.join(scratch, `${randomUUID()}-audio.wav`)
  await link(audioPath, upload)
  const { bytes } = await storage.putFile(upload, audioKey)
  const assets = assetRepository(db)
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

  const transcriber = getTranscriber(
    await resolveGroqKey(db, project.workspaceId)
  )
  const skip = async (reason: SkipReason, kept: Word[] = []) => {
    reportDetail({
      ...live,
      phase: "skipped",
      skipReason: reason,
      text: "",
      words: kept.length,
      audioMs: kept.at(-1)?.endMs ?? 0,
    })
    await completeStep(db, project.id, "analyzing", "analyze")
  }
  if (!transcriber) {
    logger.info("no transcription key, skipped transcription")
    return skip("no_key")
  }

  const transcripts = transcriptRepository(db)
  const previous = await transcripts.get(project.id)
  const audioTrack = trackExists ? track : null
  const setting = resolveLanguage({
    setting: project.settings.language,
    sourceLanguage: project.sourceLanguage,
  })
  const resume =
    previous?.partial &&
    previous.partial.audioTrack === audioTrack &&
    (!setting || setting.language === previous.language)
      ? { ...previous, partial: previous.partial }
      : undefined
  const previousEndMs = previous?.words.at(-1)?.endMs
  const base = resume?.words ?? []
  const received: RawToken[] = []
  let chosen: Awaited<ReturnType<typeof chooseLanguage>> | undefined
  const store = async (
    tokens: RawToken[],
    language: string,
    untilMs: number | null
  ) => {
    const words = [
      ...base,
      ...normalizeWords(tokens).filter(
        (w) => w.startMs < durationMs || !durationMs
      ),
    ]
    await transcripts.save(project.id, {
      language,
      languageSource: chosen!.source,
      words,
      segments: buildSegments(words),
      partial: untilMs === null ? null : { untilMs, audioTrack },
    })
    return words
  }
  // A transcript that reaches further, from an earlier run, stays until this one passes it.
  const passesPrevious = () =>
    resume !== undefined ||
    previousEndMs === undefined ||
    (received.at(-1)?.endMs ?? -1) > previousEndMs

  let raw: RawTranscript
  try {
    if (resume) {
      chosen = {
        language: resume.language,
        source: resume.languageSource ?? "detected",
      }
      logger.info(
        { fromMs: resume.partial.untilMs, words: base.length },
        "resuming transcription"
      )
    } else {
      reportDetail({ ...live, phase: "detecting" })
      chosen = await chooseLanguage(
        project,
        transcriber,
        audioPath,
        durationMs,
        { signal, scratch, logger }
      )
    }
    reportProgress(15)
    live.phase = "transcribing"
    live.language = chosen.language === "auto" ? null : chosen.language
    live.languageSource = chosen.source
    live.words = base.length
    live.audioMs = resume?.partial.untilMs ?? 0
    reportDetail({ ...live })

    raw = await transcriber.transcribe({
      audioPath,
      durationMs,
      language: chosen.language,
      fromMs: resume?.partial.untilMs,
      signal,
      onProgress: (p) => reportProgress(15 + p * 0.85),
      onWord: (word) => {
        live.text = textTail(`${live.text} ${word.text}`.trim())
        live.words++
        live.audioMs = Math.max(live.audioMs, word.startMs)
        reportDetail({ ...live })
      },
      onChunk: async ({ tokens, language, untilMs }) => {
        received.push(...tokens)
        if (passesPrevious()) await store(received, language, untilMs)
      },
    })
  } catch (error) {
    const reason = skipReason(error, {
      lastAttempt: job.attempts >= job.maxAttempts,
    })
    if (!reason) throw error
    const kept = (received.length || resume) && passesPrevious()
    logger.warn(
      { err: error, reason, keptTokens: received.length },
      "transcriber refused, continuing without the rest of the transcript"
    )
    return skip(
      reason,
      kept ? ((await transcripts.get(project.id))?.words ?? []) : []
    )
  }
  throwIfAborted(signal)

  const words = await store(raw.tokens, raw.language, null)
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
