import "server-only"

import { getStorage, storageKeys } from "@/lib/storage"

import type { JobHandler } from "../../jobs/worker-loop"
import { layoutRepository } from "../../layout/repository"
import { FULL_FRAME } from "../../layout/schema"
import { assetRepository } from "../../projects/repository"
import { runFfmpeg, runFfprobe } from "../../render/ffmpeg-runner"
import {
  beginStep,
  completeStep,
  produceFile,
  sourceAsset,
  throwIfAborted,
} from "./common"
import { classifyAspect, isLandscape, parseProbe } from "./probe-parse"

export const probeStep: JobHandler = async ({
  job,
  db,
  signal,
  scratch,
  reportProgress,
  logger,
}) => {
  const project = await beginStep(db, job.projectId, "probing")
  const storage = getStorage()
  const assets = assetRepository(db)
  const source = await sourceAsset(db, project)
  const sourcePath = await storage.localCopy(source.storageKey, scratch, signal)

  const info = parseProbe(await runFfprobe(sourcePath, signal))
  await assets.update(source.id, {
    durationMs: info.durationMs,
    width: info.displayWidth,
    height: info.displayHeight,
    fps: info.fps,
    codec: info.codec,
    audioTracks: info.audioTracks,
  })
  reportProgress(10)

  const thumbKey = storageKeys.thumbnail(project.id)
  if (!(await assets.findByKind(project.id, "thumbnail"))) {
    await produceFile(scratch, thumbKey, (file) =>
      runFfmpeg(
        [
          "-ss",
          String((info.durationMs * 0.1) / 1000),
          "-i",
          sourcePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2",
          "-q:v",
          "4",
          file,
        ],
        { signal, timeoutMs: 60_000 }
      )
    )
    await assets.create({
      projectId: project.id,
      kind: "thumbnail",
      storageKey: thumbKey,
      mime: "image/jpeg",
      bytes: (await storage.stat(thumbKey))?.bytes ?? 0,
      width: 640,
    })
  }
  reportProgress(20)

  const proxyKey = storageKeys.proxy(project.id)
  await produceFile(scratch, proxyKey, (file) =>
    runFfmpeg(
      [
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        "scale=640:-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        file,
      ],
      {
        signal,
        expectedDurationMs: info.durationMs,
        onProgress: (p) => reportProgress(20 + p * 0.8),
      }
    )
  )
  await assets.create({
    projectId: project.id,
    kind: "proxy",
    storageKey: proxyKey,
    mime: "video/mp4",
    bytes: (await storage.stat(proxyKey))?.bytes ?? 0,
    durationMs: info.durationMs,
    width: 640,
  })
  throwIfAborted(signal)

  const layouts = layoutRepository(db)
  const sourceAspect = classifyAspect(info.displayWidth, info.displayHeight)
  const landscape = isLandscape(info.displayWidth, info.displayHeight)
  const preset = await layouts.findPreset(info.displayWidth, info.displayHeight)
  if (preset) {
    await layouts.upsert(project.id, {
      sourceAspect,
      webcamRect: preset.webcamRect,
      gameplayRect: preset.gameplayRect,
      gameplayFocusX: preset.gameplayFocusX,
      mode: preset.mode,
      camPosition: preset.camPosition,
      confidence: 1,
      confirmedByUser: true,
    })
  } else {
    await layouts.upsert(project.id, {
      sourceAspect,
      webcamRect: null,
      gameplayRect: FULL_FRAME,
      gameplayFocusX: 0.5,
      mode: landscape ? "cam-top" : "no-cam-blur-fill",
      confirmedByUser: !landscape,
    })
  }

  logger.info({ ...info, sourceAspect, preset: Boolean(preset) }, "probed")
  await completeStep(db, project.id, "transcribing", "transcribe")
}
