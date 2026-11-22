import "server-only"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage, storageKeys } from "@/lib/storage"

import { signalsRepository } from "../../analysis/repository"
import { buildAss } from "../../captions/ass"
import { buildCaptionPages, wordsInRange } from "../../captions/pages"
import { resolveCaptionStyle } from "../../captions/styles"
import type { JobHandler } from "../../jobs/worker-loop"
import { assetRepository, projectRepository } from "../../projects/repository"
import { estimateRenderBytes } from "../../render/disk"
import { editedDuration, keepRanges, remapToEdit } from "../../render/edit"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import { chooseEncoder, editGraph, renderArgs } from "../../render/filtergraph"
import { CAPTION_FONTS_DIR } from "../../render/fonts"
import { assertDiskSpace } from "../../render/service"
import { transcriptRepository } from "../../transcription/repository"
import { sourceFile, throwIfAborted } from "./common"

const EDIT_BASELINE = 0.9
const EDIT_FONT_SCALE = 1.3

export const renderEditStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  if (!job.projectId) throw new AppError("VALIDATION", "Job has no project")
  const project = projectRepository(db).get(job.projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  const source = await sourceFile(db, project)
  const durationMs = source.durationMs ?? 0
  const width = source.width ?? 1920
  const height = source.height ?? 1080
  const signals = signalsRepository(db).get(project.id)
  const keep = keepRanges(signals?.silences ?? [], durationMs)
  if (keep.length === 0) {
    throw new AppError("CONFLICT", "The recording is silent from start to end")
  }

  const env = getEnv()
  const capabilities = await getFfmpegCapabilities(env.FFMPEG_PATH)
  const captions = project.settings.captionsEnabled
  if (captions && !capabilities.hasLibass) {
    throw new AppError(
      "DEPENDENCY_MISSING",
      "This ffmpeg can't burn in captions (no libass). Install one with libass or turn captions off."
    )
  }
  const outputMs = editedDuration(keep)
  await assertDiskSpace(
    env.DATA_DIR,
    estimateRenderBytes(outputMs, width * height)
  )

  const storage = getStorage()
  const stamp = Date.now()
  const workKey = (name: string) =>
    storageKeys.work(project.id, `edit-${stamp}.${name}`)
  let subtitles: { file: string; fontsDir: string } | undefined
  if (captions) {
    const preset = resolveCaptionStyle(project.settings.captionStyle)
    const style = {
      ...preset,
      fontSize: Math.round(preset.fontSize * (height / 1920) * EDIT_FONT_SCALE),
      outline: Math.max(2, Math.round(preset.outline * (height / 1920) * 1.3)),
    }
    const words = remapToEdit(
      wordsInRange(
        transcriptRepository(db).get(project.id)?.words ?? [],
        0,
        durationMs
      ),
      keep
    )
    const pages = buildCaptionPages(words, outputMs, {
      maxWordsPerPage: style.maxWordsPerPage,
      maxCharsPerLine: style.maxCharsPerLine + 10,
    })
    await storage.writeBuffer(
      workKey("ass"),
      buildAss({ pages, style, baseline: EDIT_BASELINE, width, height })
    )
    subtitles = {
      file: storage.resolve(workKey("ass")),
      fontsDir: CAPTION_FONTS_DIR,
    }
  }

  await storage.writeBuffer(
    workKey("graph.txt"),
    editGraph({ keep, subtitles })
  )
  const encoder = chooseEncoder(env.VIDEO_ENCODER, capabilities.encoders)
  const outputKey = storageKeys.edit(project.id, stamp)
  try {
    await runFfmpeg(
      renderArgs({
        input: storage.resolve(source.storageKey),
        seekMs: 0,
        graphFile: storage.resolve(workKey("graph.txt")),
        encoder,
        output: storage.resolve(workKey("mp4")),
      }),
      {
        signal,
        expectedDurationMs: outputMs,
        onProgress: (p) => reportProgress(p * 0.99),
      }
    )
    throwIfAborted(signal)
    await storage.move(workKey("mp4"), outputKey)
  } catch (error) {
    await storage.remove(workKey("mp4"))
    throw error
  } finally {
    await storage.remove(workKey("graph.txt"))
    if (subtitles) await storage.remove(workKey("ass"))
  }

  const assets = assetRepository(db)
  const previous = assets.findByKind(project.id, "edit")
  const asset = assets.create({
    projectId: project.id,
    kind: "edit",
    storageKey: outputKey,
    mime: "video/mp4",
    bytes: (await storage.stat(outputKey))?.bytes ?? 0,
    durationMs: outputMs,
    width,
    height,
    fps: source.fps,
    codec: encoder,
  })
  if (previous) {
    assets.delete(previous.id)
    await storage.remove(previous.storageKey)
  }
  logger.info(
    {
      cuts: keep.length - 1,
      savedMs: durationMs - outputMs,
      bytes: asset.bytes,
    },
    "edit rendered"
  )
}
