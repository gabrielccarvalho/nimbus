import "server-only"

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage, storageKeys } from "@/lib/storage"
import { assertDiskSpace } from "@/lib/storage/disk"

import { buildAss } from "../../captions/ass"
import { overlayEndMs } from "../../captions/overlay"
import { clipCaptionPages, wordsInRange } from "../../captions/pages"
import { captionBaseline, resolveCaptionStyle } from "../../captions/styles"
import { clipRepository } from "../../clips/repository"
import type { JobHandler } from "../../jobs/worker-loop"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH, planLayout } from "../../layout/geometry"
import { layoutRepository } from "../../layout/repository"
import { planAudio } from "../../music/envelope"
import { musicRepository } from "../../music/repository"
import { assetRepository, projectRepository } from "../../projects/repository"
import { publishingRepository } from "../../publishing/repository"
import { estimateRenderBytes } from "../../render/disk"
import { effectCommands, effectsGraph } from "../../render/effects-graph"
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
import { recordUsage } from "../../accounts/usage"
import { getAppSettings } from "../../settings/service"
import { speakerTranscriptWords } from "../../captions/speaker"
import { transcriptRepository } from "../../transcription/repository"
import { produceFile, sourceFile, throwIfAborted } from "./common"

export const renderClipStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
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

  const { audioMix, textOverlay } = clip
  const track = audioMix?.trackId
    ? await musicRepository(db).get(audioMix.trackId)
    : null
  if (audioMix?.trackId && track?.workspaceId !== project.workspaceId) {
    throw new AppError(
      "CONFLICT",
      "This clip's music track was deleted. Pick another track or remove the music."
    )
  }
  const trackDurationMs = track?.durationMs ?? null
  if (track && (track.status !== "ready" || trackDurationMs === null)) {
    throw new AppError(
      "CONFLICT",
      "This clip's music track isn't ready. Pick another track or remove the music."
    )
  }

  const env = getEnv()
  const capabilities = await getFfmpegCapabilities(env.FFMPEG_PATH)
  const captions = project.settings.captionsEnabled
  if ((captions || textOverlay) && !capabilities.hasLibass) {
    throw new AppError(
      "DEPENDENCY_MISSING",
      captions
        ? "This ffmpeg can't burn in captions (no libass). Install one with libass or turn captions off."
        : "This ffmpeg can't burn in on-screen text (no libass). Install one with libass or remove the text."
    )
  }
  const storage = getStorage()
  const durationMs = clip.endMs - clip.startMs
  await assertDiskSpace(
    env.SCRATCH_DIR,
    estimateRenderBytes(durationMs) +
      storage.localCopyCost(source.bytes + (track?.bytes ?? 0))
  )

  const words =
    captions || audioMix?.duck
      ? speakerTranscriptWords(await transcriptRepository(db).get(project.id))
      : []
  const audio = planAudio(
    audioMix,
    trackDurationMs === null ? null : { durationMs: trackDurationMs },
    durationMs,
    wordsInRange(words, clip.startMs, clip.endMs)
  )

  const stamp = Date.now()
  const workFile = (name: string) => path.join(scratch, `${clip.id}.${name}`)
  let subtitles: { file: string; fontsDir: string } | undefined
  if (captions || textOverlay) {
    const style = resolveCaptionStyle(
      clip.captionOverrides?.style ?? project.settings.captionStyle
    )
    await writeFile(
      workFile("ass"),
      buildAss({
        pages: captions ? clipCaptionPages(words, clip, style) : [],
        style,
        baseline: captionBaseline(style, layout),
        overlay: textOverlay
          ? {
              text: textOverlay.text,
              position: textOverlay.position,
              endMs: overlayEndMs(textOverlay, durationMs),
            }
          : undefined,
      })
    )
    subtitles = {
      file: workFile("ass"),
      fontsDir: CAPTION_FONTS_DIR,
    }
  }

  const fps = outputFps(source.fps)
  const events = clip.effects?.events ?? []
  const range = { startMs: clip.startMs, endMs: clip.endMs, fps }
  let graph: string
  let commands = ""
  if (events.length > 0) {
    const effects = {
      layout,
      source: { width: source.width, height: source.height },
      events,
      ...range,
    }
    commands = effectCommands(effects)
    // sendcmd refuses an empty file.
    if (commands) await writeFile(workFile("cmds.txt"), commands)
    graph = effectsGraph({
      ...effects,
      commandsFile: commands ? workFile("cmds.txt") : undefined,
      subtitles,
      audio,
    })
  } else {
    graph = verticalGraph({
      plan: planLayout(layout, source.width, source.height),
      ...range,
      subtitles,
      audio,
    })
  }
  await writeFile(workFile("graph.txt"), graph)
  const settings = await getAppSettings(db, project.workspaceId)
  const encoder = chooseEncoder(
    encoderPreference(settings.hardwareEncoding, env.VIDEO_ENCODER),
    capabilities.encoders
  )
  const outputKey = storageKeys.render(project.id, clip.id, stamp)
  reportProgress(2)

  const input = await storage.localCopy(source.storageKey, scratch, signal)
  const music =
    audio?.music && track && audioMix
      ? {
          file: await storage.localCopy(track.storageKey, scratch, signal),
          seekMs: audioMix.trackStartMs,
        }
      : undefined
  await produceFile(scratch, outputKey, async (output) => {
    await runFfmpeg(
      renderArgs({
        input,
        seekMs: seekFor(clip.startMs).seekMs,
        music,
        graphFile: workFile("graph.txt"),
        encoder,
        crf: renderQualityCrf[project.settings.renderQuality],
        output,
      }),
      {
        signal,
        expectedDurationMs: durationMs,
        onProgress: (p) => reportProgress(2 + p * 0.97),
      }
    )
    throwIfAborted(signal)
  })

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
  if (
    previous &&
    !(await publishingRepository(db).assetInActiveUse(previous.id))
  ) {
    await assets.delete(previous.id)
    await storage.remove(previous.storageKey)
  }
  await recordUsage(db, project, "render_seconds", durationMs / 1000)
  logger.info(
    {
      clipId: clip.id,
      encoder,
      captions,
      music: Boolean(audio?.music),
      overlay: Boolean(textOverlay),
      bytes: asset.bytes,
    },
    "clip rendered"
  )
}
