import "server-only"

import type { Db } from "@/lib/db"

import { clipRepository } from "../clips/repository"
import type { ClipStatus } from "../clips/schema"
import { jobQueue } from "../jobs/queue"
import type { JobStatus, JobType } from "../jobs/schema"
import { projectRepository } from "../projects/repository"
import type { ProjectStatus } from "../projects/schema"

export type ProjectSnapshot = {
  id: string
  status: ProjectStatus
  failedStep: ProjectStatus | null
  error: string | null
  awaitingManualSelection: boolean
  jobs: Array<{
    id: string
    type: JobType
    status: JobStatus
    progress: number
    attempts: number
    error: string | null
    clipId: string | null
  }>
  clips: Array<{ id: string; status: ClipStatus }>
}

export function getProjectSnapshot(
  db: Db,
  projectId: string
): ProjectSnapshot | undefined {
  const project = projectRepository(db).get(projectId)
  if (!project) return undefined
  const jobs = jobQueue(db)
    .listForProject(projectId)
    .slice(0, 50)
    .map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: Math.round(job.progress),
      attempts: job.attempts,
      error: job.error ? job.error.split("\n")[0]! : null,
      clipId:
        typeof job.payload.clipId === "string" ? job.payload.clipId : null,
    }))
  const clips = clipRepository(db)
    .listForProject(projectId)
    .map((clip) => ({ id: clip.id, status: clip.status }))
  return {
    id: project.id,
    status: project.status,
    failedStep: project.failedStep,
    error: project.error,
    awaitingManualSelection: project.awaitingManualSelection,
    jobs,
    clips,
  }
}
