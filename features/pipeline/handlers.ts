import "server-only"

import type { Db } from "@/lib/db"
import { toUserMessage, type AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import type { Job } from "../jobs/queue"
import type { JobHandlers } from "../jobs/worker-loop"
import { projectRepository } from "../projects/repository"
import { publishingRepository } from "../publishing/repository"
import { releaseRenderAsset } from "../publishing/service"
import { analyzeStep } from "./steps/analyze"
import { downloadStep } from "./steps/download"
import { settleRendering } from "../render/service"
import { probeStep } from "./steps/probe"
import { publishClipStep } from "./steps/publish-clip"
import { renderClipStep } from "./steps/render-clip"
import { renderEditStep } from "./steps/render-edit"
import { selectStep } from "./steps/select"
import { sweepStep } from "./steps/sweep"
import { transcribeStep } from "./steps/transcribe"

export const pipelineHandlers: JobHandlers = {
  download: downloadStep,
  probe: probeStep,
  transcribe: transcribeStep,
  analyze: analyzeStep,
  select: selectStep,
  render_clip: renderClipStep,
  render_edit: renderEditStep,
  sweep: sweepStep,
  publish_clip: publishClipStep,
}

const MINUTE = 60_000

export function jobStallTimeoutMs(job: Job): number {
  switch (job.type) {
    case "download":
    case "transcribe":
    case "render_edit":
    case "publish_clip":
      return 30 * MINUTE
    case "select":
      return 20 * MINUTE
    case "probe":
    case "analyze":
    case "render_clip":
      return 15 * MINUTE
    case "sweep":
      return 10 * MINUTE
  }
}

export async function onJobSucceeded(db: Db, job: Job) {
  if (job.type === "render_clip" && job.projectId) {
    await settleRendering(db, job.projectId)
  }
}

async function failPublication(db: Db, job: Job, message: string) {
  const publicationId = job.payload.publicationId
  const publishing = publishingRepository(db)
  if (
    typeof publicationId === "string" &&
    (await publishing.getPublication(publicationId))
  ) {
    await releaseRenderAsset(
      db,
      await publishing.updatePublication(publicationId, {
        status: "failed",
        error: message,
      })
    )
  }
}

export async function onJobFinalFailure(db: Db, job: Job, error: AppError) {
  if (job.type === "publish_clip") {
    await failPublication(db, job, toUserMessage(error))
    return
  }
  if (!job.projectId) return
  if (job.type === "render_clip") {
    const clipId = job.payload.clipId
    const clips = clipRepository(db)
    if (typeof clipId === "string" && (await clips.get(clipId))) {
      await clips.update(clipId, { status: "failed", error: error.message })
    }
    await settleRendering(db, job.projectId)
    return
  }
  if (job.type === "render_edit" || job.type === "sweep") return
  await projectRepository(db).markFailed(job.projectId, error.message)
}

export async function onJobCancelled(db: Db, job: Job) {
  if (job.type === "publish_clip") {
    await failPublication(db, job, "Cancelled")
    return
  }
  if (job.type !== "render_clip") return
  const clipId = job.payload.clipId
  const clips = clipRepository(db)
  if (typeof clipId === "string" && (await clips.get(clipId))) {
    await clips.update(clipId, { status: "approved" })
  }
  if (job.projectId) await settleRendering(db, job.projectId)
}
