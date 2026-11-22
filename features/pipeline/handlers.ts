import "server-only"

import type { Db } from "@/lib/db"
import type { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import type { Job } from "../jobs/queue"
import type { JobHandlers } from "../jobs/worker-loop"
import { projectRepository } from "../projects/repository"
import { probeStep } from "./steps/probe"
import { transcribeStep } from "./steps/transcribe"

export const pipelineHandlers: JobHandlers = {
  probe: probeStep,
  transcribe: transcribeStep,
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

export function onJobFinalFailure(db: Db, job: Job, error: AppError) {
  if (!job.projectId) return
  if (job.type === "render_clip") {
    const clipId = job.payload.clipId
    if (typeof clipId === "string") {
      clipRepository(db).update(clipId, {
        status: "failed",
        error: error.message,
      })
    }
    return
  }
  if (job.type === "render_edit" || job.type === "sweep") return
  projectRepository(db).markFailed(job.projectId, error.message)
}

export function onJobCancelled(db: Db, job: Job) {
  if (job.type !== "render_clip") return
  const clipId = job.payload.clipId
  if (typeof clipId === "string") {
    clipRepository(db).update(clipId, { status: "approved" })
  }
}
