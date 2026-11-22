import "server-only"

import type { Db } from "@/lib/db"
import type { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import type { Job } from "../jobs/queue"
import type { JobHandlers } from "../jobs/worker-loop"
import { projectRepository } from "../projects/repository"
import { analyzeStep } from "./steps/analyze"
import { settleRendering } from "../render/service"
import { probeStep } from "./steps/probe"
import { renderClipStep } from "./steps/render-clip"
import { renderEditStep } from "./steps/render-edit"
import { selectStep } from "./steps/select"
import { transcribeStep } from "./steps/transcribe"

export const pipelineHandlers: JobHandlers = {
  probe: probeStep,
  transcribe: transcribeStep,
  analyze: analyzeStep,
  select: selectStep,
  render_clip: renderClipStep,
  render_edit: renderEditStep,
}

const MINUTE = 60_000

export function jobTimeoutMs(job: Job): number {
  switch (job.type) {
    case "probe":
      return 10 * MINUTE
    case "transcribe":
      return 6 * 60 * MINUTE
    case "analyze":
      return 30 * MINUTE
    case "select":
      return 10 * MINUTE
    case "render_clip":
      return 30 * MINUTE
    case "render_edit":
      return 6 * 60 * MINUTE
    case "sweep":
      return 10 * MINUTE
  }
}

export function onJobSucceeded(db: Db, job: Job) {
  if (job.type === "render_clip" && job.projectId) {
    settleRendering(db, job.projectId)
  }
}

export function onJobFinalFailure(db: Db, job: Job, error: AppError) {
  if (!job.projectId) return
  if (job.type === "render_clip") {
    const clipId = job.payload.clipId
    if (typeof clipId === "string" && clipRepository(db).get(clipId)) {
      clipRepository(db).update(clipId, {
        status: "failed",
        error: error.message,
      })
    }
    settleRendering(db, job.projectId)
    return
  }
  if (job.type === "render_edit" || job.type === "sweep") return
  projectRepository(db).markFailed(job.projectId, error.message)
}

export function onJobCancelled(db: Db, job: Job) {
  if (job.type !== "render_clip") return
  const clipId = job.payload.clipId
  if (typeof clipId === "string" && clipRepository(db).get(clipId)) {
    clipRepository(db).update(clipId, { status: "approved" })
  }
  if (job.projectId) settleRendering(db, job.projectId)
}
