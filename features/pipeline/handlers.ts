import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError, toUserMessage } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import { jobQueue, type Job } from "../jobs/queue"
import type { JobHandler, JobHandlers } from "../jobs/worker-loop"
import { projectRepository } from "../projects/repository"
import { publishingRepository } from "../publishing/repository"
import { ACTIVE_PUBLICATION_STATUSES } from "../publishing/schema"
import { releaseRenderAsset } from "../publishing/service"
import { analyzeStep } from "./steps/analyze"
import { analyzePerformanceStep } from "./steps/analyze-performance"
import { downloadStep } from "./steps/download"
import { settleRendering } from "../render/service"
import { probeStep } from "./steps/probe"
import { publishClipStep } from "./steps/publish-clip"
import { renderClipStep } from "./steps/render-clip"
import { renderEditStep } from "./steps/render-edit"
import { selectStep } from "./steps/select"
import { sweepStep } from "./steps/sweep"
import { syncStatsStep } from "./steps/sync-stats"
import { transcribeStep } from "./steps/transcribe"

const notImplemented: JobHandler = async () => {
  throw new AppError("INTERNAL", "not implemented")
}

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
  sync_stats: syncStatsStep,
  analyze_performance: analyzePerformanceStep,
  sync_uploads: notImplemented,
  sync_channel: notImplemented,
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
    case "analyze_performance":
    case "sync_uploads":
      return 15 * MINUTE
    case "sweep":
      return 10 * MINUTE
    case "sync_stats":
    case "sync_channel":
      return 5 * MINUTE
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

// Publish jobs are only cancelled by a worker shutdown or a deleted project,
// so an active publication goes back to the queue and resumes its session.
async function requeuePublication(db: Db, job: Job) {
  const publicationId = job.payload.publicationId
  if (typeof publicationId !== "string") return
  await withTransaction(db, async (tx) => {
    const publishing = publishingRepository(tx)
    const publication = await publishing.getPublication(publicationId)
    if (!publication || !ACTIVE_PUBLICATION_STATUSES.has(publication.status)) {
      return
    }
    await publishing.updatePublication(publicationId, { status: "queued" })
    await jobQueue(tx).enqueue({
      type: "publish_clip",
      projectId: job.projectId,
      payload: { publicationId },
    })
  })
}

export async function onJobCancelled(db: Db, job: Job) {
  if (job.type === "publish_clip") {
    await requeuePublication(db, job)
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
