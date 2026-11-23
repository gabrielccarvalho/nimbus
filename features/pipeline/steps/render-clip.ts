import "server-only"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { buildAss } from "../../captions/ass"
import {
  applyPageOverrides,
  buildCaptionPages,
  wordsInRange,
} from "../../captions/pages"
import { captionBaseline, resolveCaptionStyle } from "../../captions/styles"
import { clipRepository } from "../../clips/repository"
import type { JobHandler } from "../../jobs/worker-loop"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH, planLayout } from "../../layout/geometry"
import { layoutRepository } from "../../layout/repository"
import { assetRepository, projectRepository } from "../../projects/repository"
import { estimateRenderBytes } from "../../render/disk"
import { runFfmpeg } from "../../render/ffmpeg-runner"
import {
  chooseEncoder,
  encoderPreference,
  outputFps,
  renderArgs,
  seekFor,
  verticalGraph,
} from "../../render/filtergraph"
import { CAPTION_FONTS_DIR } from "../../render/fonts"
import { renderQualityCrf } from "../../settings/schema"
import { getAppSettings } from "../../settings/service"
import { speakerTranscriptWords } from "../../captions/speaker"
import { transcriptRepository } from "../../transcription/repository"
import { sourceFile, throwIfAborted } from "./common"

export const renderClipStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const clipId = job.payload.clipId
  if (!job.projectId || typeof clipId !== "string") {
    throw new AppError("VALIDATION", "Render job is missing its clip")
  }
  const project = await projectRepository(db).get(job.projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  const clips = clipRepository(db)
  const clip = await clips.get(clipId)
  if (!clip || clip.projectId !== project.id) {
    throw new AppError("CANCELLED", "Clip was deleted")
  }
  const layout =
    clip.layoutOverride ?? (await layoutRepository(db).get(project.id))
  if (!layout) throw new AppError("CONFLICT", "The layout is missing")
  const source = await sourceFile(db, project)
  if (!source.width || !source.height) {
    throw new AppError("CONFLICT", "The source hasn't been probed")
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
  const storage = getStorage()
  const durationMs = clip.endMs - clip.startMs
  await assertDiskSpace(env.DATA_DIR, estimateRenderBytes(durationMs))

  const stamp = Date.now()
  const workKey = (name: string) =>
    storageKeys.work(project.id, `${clip.id}-${stamp}.${name}`)
  let subtitles: { file: string; fontsDir: string } | undefined
  if (captions) {
    const style = resolveCaptionStyle(
      clip.captionOverrides?.style ?? project.settings.captionStyle
    )
    const words = wordsInRange(
      speakerTranscriptWords(await transcriptRepository(db).get(project.id)),
      clip.startMs,
      clip.endMs
    )
    const pages = applyPageOverrides(
      buildCaptionPages(words, durationMs, {
        maxWordsPerPage: style.maxWordsPerPage,
        maxCharsPerLine: style.maxCharsPerLine,
      }),
      clip.captionOverrides?.pages ?? [],
      { maxCharsPerLine: style.maxCharsPerLine, maxLines: 2 }
    )
    await storage.writeBuffer(
      workKey("ass"),
      buildAss({ pages, style, baseline: captionBaseline(style, layout) })
    )
    subtitles = {
      file: storage.resolve(workKey("ass")),
      fontsDir: CAPTION_FONTS_DIR,
    }
  }

  const fps = outputFps(source.fps)
  const graph = verticalGraph({
    plan: planLayout(layout, source.width, source.height),
    startMs: clip.startMs,
    endMs: clip.endMs,
    fps,
    subtitles,
  })
  await storage.writeBuffer(workKey("graph.txt"), graph)
  const settings = await getAppSettings(db)
  const encoder = chooseEncoder(
    encoderPreference(settings.hardwareEncoding, env.VIDEO_ENCODER),
    capabilities.encoders
  )
  const outputKey = storageKeys.render(project.id, clip.id, stamp)
  reportProgress(2)

  try {
    await runFfmpeg(
      renderArgs({
        input: storage.resolve(source.storageKey),
        seekMs: seekFor(clip.startMs).seekMs,
        graphFile: storage.resolve(workKey("graph.txt")),
        encoder,
        crf: renderQualityCrf[project.settings.renderQuality],
        output: storage.resolve(workKey("mp4")),
      }),
      {
        signal,
        expectedDurationMs: durationMs,
        onProgress: (p) => reportProgress(2 + p * 0.97),
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
  const asset = await assets.create({
    projectId: project.id,
    kind: "render",
    storageKey: outputKey,
    mime: "video/mp4",
    bytes: (await storage.stat(outputKey))?.bytes ?? 0,
    durationMs,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    fps,
    codec: encoder,
  })
  const previous = clip.renderAssetId
    ? await assets.get(clip.renderAssetId)
    : undefined
  await clips.update(clip.id, {
    status: "rendered",
    renderAssetId: asset.id,
    error: null,
  })
  if (previous) {
    await assets.delete(previous.id)
    await storage.remove(previous.storageKey)
  }
  logger.info(
    { clipId: clip.id, encoder, captions, bytes: asset.bytes },
    "clip rendered"
  )
}
