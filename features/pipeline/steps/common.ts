import "server-only"

import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"

import { jobQueue } from "../../jobs/queue"
import type { JobType } from "../../jobs/schema"
import {
  assetRepository,
  projectRepository,
  type Project,
} from "../../projects/repository"
import type { ProjectStatus } from "../../projects/schema"
import type { RunningStatus } from "../state-machine"

export async function beginStep(
  db: Db,
  projectId: string | null,
  step: RunningStatus
): Promise<Project> {
  if (!projectId) throw new AppError("VALIDATION", "Job has no project")
  const projects = projectRepository(db)
  const project = await projects.get(projectId)
  if (!project) throw new AppError("CANCELLED", "Project was deleted")
  if (project.status === step) return project
  if (project.status === "cancelled") {
    throw new AppError("CANCELLED", "Project was cancelled")
  }
  return projects.transition(projectId, step)
}

export async function completeStep(
  db: Db,
  projectId: string,
  next: ProjectStatus,
  nextJob?: JobType
) {
  await withTransaction(db, async (tx) => {
    await projectRepository(tx).transition(projectId, next)
    if (nextJob) await jobQueue(tx).enqueue({ type: nextJob, projectId })
  })
}

export async function sourceAsset(db: Db, project: Project) {
  const asset = project.sourceAssetId
    ? await assetRepository(db).get(project.sourceAssetId)
    : undefined
  if (!asset) throw new AppError("NOT_FOUND", "The source video is missing")
  return asset
}

export async function sourceFile(db: Db, project: Project) {
  const asset = await sourceAsset(db, project)
  if (!(await getStorage().stat(asset.storageKey))) {
    throw new AppError(
      "NOT_FOUND",
      "The source video file is missing from disk"
    )
  }
  return asset
}

// A retried job can overlap an orphaned ffmpeg from a killed worker, so each
// attempt writes its own work file and only a finished one replaces the target.
export async function produceFile(
  projectId: string,
  key: string,
  produce: (file: string) => Promise<unknown>
) {
  const storage = getStorage()
  const workKey = storageKeys.work(
    projectId,
    `${randomUUID()}-${path.posix.basename(key)}`
  )
  const file = storage.resolve(workKey)
  await mkdir(path.dirname(file), { recursive: true })
  try {
    await produce(file)
    await storage.move(workKey, key)
  } catch (error) {
    await storage.remove(workKey)
    throw error
  }
}

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason instanceof AppError
      ? signal.reason
      : new AppError("CANCELLED", "Job was cancelled")
  }
}
