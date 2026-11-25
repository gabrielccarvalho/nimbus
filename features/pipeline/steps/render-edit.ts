import "server-only"

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { signalsRepository } from "../../analysis/repository"
import { buildAss } from "../../captions/ass"
import { buildCaptionPages, wordsInRange } from "../../captions/pages"
import { resolveCaptionStyle } from "../../captions/styles"
import type { JobHandler } from "../../jobs/worker-loop"
import { assetRepository, projectRepository } from "../../projects/repository"
import { estimateRenderBytes } from "../../render/disk"
import { editedDuration, keepRanges, remapToEdit } from "../../render/edit"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import {
  chooseEncoder,
  editGraph,
  encoderPreference,
  renderArgs,
} from "../../render/filtergraph"
import { CAPTION_FONTS_DIR } from "../../render/fonts"
import { renderQualityCrf } from "../../settings/schema"
import { recordUsage } from "../../accounts/usage"
import { getAppSettings } from "../../settings/service"
import { speakerTranscriptWords } from "../../captions/speaker"
import { transcriptRepository } from "../../transcription/repository"
import { produceFile, sourceFile, throwIfAborted } from "./common"

const EDIT_BASELINE = 0.9
const EDIT_FONT_SCALE = 1.3

export const renderEditStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
  reportProgress,
  logger,
}) => {
  if (!job.projectId) throw new AppError("VALIDATION", "Job has no project")
  const project = await projectRepository(db).get(job.projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  const source = await sourceFile(db, project)
  const durationMs = source.durationMs ?? 0
  const width = source.width ?? 1920
  const height = source.height ?? 1080
  const signals = await signalsRepository(db).get(project.id)
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
    env.SCRATCH_DIR,
    estimateRenderBytes(outputMs, width * height)
  )

  const storage = getStorage()
  const stamp = Date.now()
  const workFile = (name: string) => path.join(scratch, `edit.${name}`)
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
        speakerTranscriptWords(await transcriptRepository(db).get(project.id)),
        0,
        durationMs
      ),
      keep
    )
    const pages = buildCaptionPages(words, outputMs, {
      maxWordsPerPage: style.maxWordsPerPage,
      maxCharsPerLine: style.maxCharsPerLine + 10,
    })
    await writeFile(
      workFile("ass"),
      buildAss({ pages, style, baseline: EDIT_BASELINE, width, height })
    )
    subtitles = {
      file: workFile("ass"),
      fontsDir: CAPTION_FONTS_DIR,
    }
  }

  await writeFile(workFile("graph.txt"), editGraph({ keep, subtitles }))
  const settings = await getAppSettings(db, project.workspaceId)
  const encoder = chooseEncoder(
    encoderPreference(settings.hardwareEncoding, env.VIDEO_ENCODER),
    capabilities.encoders
  )
  const outputKey = storageKeys.edit(project.id, stamp)
  const input = await storage.localCopy(source.storageKey, scratch, signal)
  await produceFile(scratch, outputKey, async (output) => {
    await runFfmpeg(
      renderArgs({
        input,
        seekMs: 0,
        graphFile: workFile("graph.txt"),
        encoder,
        crf: renderQualityCrf[project.settings.renderQuality],
        output,
      }),
      {
        signal,
        expectedDurationMs: outputMs,
        onProgress: (p) => reportProgress(p * 0.99),
      }
    )
    throwIfAborted(signal)
  })

  const assets = assetRepository(db)
  const previous = await assets.findByKind(project.id, "edit")
  const asset = await assets.create({
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
    await assets.delete(previous.id)
    await storage.remove(previous.storageKey)
  }
  await recordUsage(db, project, "render_seconds", outputMs / 1000)
  logger.info(
    {
      cuts: keep.length - 1,
      savedMs: durationMs - outputMs,
      bytes: asset.bytes,
    },
    "edit rendered"
  )
}
