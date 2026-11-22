import "server-only"

import { getStorage, storageKeys } from "@/lib/storage"

import type { JobHandler } from "../../jobs/worker-loop"
import { layoutRepository } from "../../layout/repository"
import { FULL_FRAME } from "../../layout/schema"
import { assetRepository } from "../../projects/repository"
import { runFfmpeg, runFfprobe } from "../../render/ffmpeg-runner"
import { beginStep, completeStep, sourceAsset, throwIfAborted } from "./common"
import { classifyAspect, parseProbe } from "./probe-parse"

export const probeStep: JobHandler = async ({
  job,
  db,
  signal,
  reportProgress,
  logger,
}) => {
  const project = beginStep(db, job.projectId, "probing")
  const storage = getStorage()
  const assets = assetRepository(db)
  const source = sourceAsset(db, project)
  const sourcePath = storage.resolve(source.storageKey)

  const info = parseProbe(await runFfprobe(sourcePath, signal))
  assets.update(source.id, {
    durationMs: info.durationMs,
    width: info.displayWidth,
    height: info.displayHeight,
    fps: info.fps,
    codec: info.codec,
  })
  reportProgress(10)

  const thumbKey = storageKeys.thumbnail(project.id)
  await runFfmpeg(
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
      storage.resolve(thumbKey),
    ],
    { signal, timeoutMs: 60_000 }
  )
  assets.create({
    projectId: project.id,
    kind: "thumbnail",
    storageKey: thumbKey,
    mime: "image/jpeg",
    bytes: (await storage.stat(thumbKey))?.bytes ?? 0,
    width: 640,
  })
  reportProgress(20)

  const proxyKey = storageKeys.proxy(project.id)
  await runFfmpeg(
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
      storage.resolve(proxyKey),
    ],
    {
      signal,
      expectedDurationMs: info.durationMs,
      onProgress: (p) => reportProgress(20 + p * 0.8),
    }
  )
  assets.create({
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
  const preset = layouts.findPreset(info.displayWidth, info.displayHeight)
  if (preset) {
    layouts.upsert(project.id, {
      sourceAspect,
      webcamRect: preset.webcamRect,
      gameplayRect: preset.gameplayRect,
      gameplayFocusX: preset.gameplayFocusX,
      mode: preset.mode,
      confidence: 1,
      confirmedByUser: true,
    })
  } else {
    layouts.upsert(project.id, {
      sourceAspect,
      webcamRect: null,
      gameplayRect: FULL_FRAME,
      gameplayFocusX: 0.5,
      mode: sourceAspect === "other" ? "no-cam-blur-fill" : "cam-top",
      confirmedByUser: sourceAspect === "other",
    })
  }

  logger.info({ ...info, sourceAspect, preset: Boolean(preset) }, "probed")
  completeStep(db, project.id, "transcribing", "transcribe")
}
