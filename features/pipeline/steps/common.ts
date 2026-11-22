import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage } from "@/lib/storage"

import { jobQueue } from "../../jobs/queue"
import type { JobType } from "../../jobs/schema"
import {
  assetRepository,
  projectRepository,
  type Project,
} from "../../projects/repository"
import type { ProjectStatus } from "../../projects/schema"
import type { RunningStatus } from "../state-machine"

export function beginStep(
  db: Db,
  projectId: string | null,
  step: RunningStatus
): Project {
  if (!projectId) throw new AppError("VALIDATION", "Job has no project")
  const projects = projectRepository(db)
  const project = projects.get(projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  if (project.status === step) return project
  if (project.status === "cancelled") {
    throw new AppError("CANCELLED", "Project was cancelled")
  }
  return projects.transition(projectId, step)
}

export function completeStep(
  db: Db,
  projectId: string,
  next: ProjectStatus,
  nextJob?: JobType
) {
  withTransaction(db, () => {
    projectRepository(db).transition(projectId, next)
    if (nextJob) jobQueue(db).enqueue({ type: nextJob, projectId })
  })
}

export function sourceAsset(db: Db, project: Project) {
  const asset = project.sourceAssetId
    ? assetRepository(db).get(project.sourceAssetId)
    : undefined
  if (!asset) throw new AppError("NOT_FOUND", "The source video is missing")
  return asset
}

export async function sourceFile(db: Db, project: Project) {
  const asset = sourceAsset(db, project)
  if (!(await getStorage().stat(asset.storageKey))) {
    throw new AppError(
      "NOT_FOUND",
      "The source video file is missing from disk"
    )
  }
  return asset
}

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason instanceof AppError
      ? signal.reason
      : new AppError("CANCELLED", "Job was cancelled")
  }
}
