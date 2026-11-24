import "server-only"

import type { Db } from "@/lib/db"

import { clipRepository } from "../clips/repository"
import type { ClipStatus } from "../clips/schema"
import { jobQueue } from "../jobs/queue"
import type { JobStatus, JobType } from "../jobs/schema"
import { layoutRepository } from "../layout/repository"
import { assetRepository, projectRepository } from "../projects/repository"
import type { ProjectStatus } from "../projects/schema"
import { stepDetailSchema, type StepDetail } from "./detail"

export type ProjectSnapshot = {
  id: string
  status: ProjectStatus
  failedStep: ProjectStatus | null
  error: string | null
  awaitingManualSelection: boolean
  revision: string
  jobs: Array<{
    id: string
    type: JobType
    status: JobStatus
    progress: number
    attempts: number
    error: string | null
    clipId: string | null
    startedAt: string | null
    finishedAt: string | null
    detail: StepDetail | null
  }>
  clips: Array<{ id: string; status: ClipStatus }>
}

export async function getProjectSnapshot(
  db: Db,
  projectId: string
): Promise<ProjectSnapshot | undefined> {
  const project = await projectRepository(db).get(projectId)
  if (!project) return undefined
  const [jobRows, assetRows, layout, clipRows] = await Promise.all([
    jobQueue(db).listForProject(projectId),
    assetRepository(db).listForProject(projectId),
    layoutRepository(db).get(projectId),
    clipRepository(db).listForProject(projectId),
  ])
  const jobs = jobRows.slice(0, 50).map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: Math.round(job.progress),
    attempts: job.attempts,
    error: job.error ? job.error.split("\n")[0]! : null,
    clipId: typeof job.payload.clipId === "string" ? job.payload.clipId : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    detail:
      job.status === "running"
        ? (stepDetailSchema.safeParse(job.detail).data ?? null)
        : null,
  }))
  const assets = assetRows
    .filter((asset) => asset.kind === "source" || asset.kind === "thumbnail")
    .map((asset) =>
      [asset.kind, asset.id, asset.durationMs, asset.width, asset.height].join(
        ":"
      )
    )
  const revision = [
    project.name,
    layout?.sourceAspect ?? "",
    ...assets.sort(),
  ].join("|")
  return {
    id: project.id,
    status: project.status,
    failedStep: project.failedStep,
    error: project.error,
    awaitingManualSelection: project.awaitingManualSelection,
    revision,
    jobs,
    clips: clipRows.map((clip) => ({ id: clip.id, status: clip.status })),
  }
}
