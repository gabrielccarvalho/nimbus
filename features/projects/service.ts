import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { storageKeys, type StorageAdapter } from "@/lib/storage"

import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import {
  isRunning,
  jobTypeForStep,
  retryTarget,
} from "../pipeline/state-machine"
import { projectRepository } from "./repository"

export function enqueueClipRenders(
  db: Db,
  projectId: string,
  clipIds: string[]
) {
  const queue = jobQueue(db)
  const clips = clipRepository(db)
  clips.setStatus(clipIds, "rendering")
  for (const clipId of clipIds) {
    queue.enqueue({ type: "render_clip", projectId, payload: { clipId } })
  }
}

export function retryProject(db: Db, projectId: string) {
  const projects = projectRepository(db)
  const project = projects.getOrThrow(projectId)
  const target = retryTarget(project.status, project.failedStep)
  withTransaction(db, () => {
    projects.resumeFailed(projectId, target)
    const jobType = jobTypeForStep(target)
    if (jobType) {
      jobQueue(db).enqueue({ type: jobType, projectId })
      return
    }
    const retryable = clipRepository(db)
      .listByStatus(projectId, ["failed", "rendering", "approved"])
      .map((clip) => clip.id)
    if (retryable.length === 0) {
      throw new AppError("CONFLICT", "There are no clips to render")
    }
    enqueueClipRenders(db, projectId, retryable)
  })
}

export function cancelProject(db: Db, projectId: string) {
  const projects = projectRepository(db)
  const project = projects.getOrThrow(projectId)
  if (!isRunning(project.status)) {
    throw new AppError("CONFLICT", "Nothing is running for this project")
  }
  withTransaction(db, () => {
    jobQueue(db).cancelForProject(projectId)
    const rendering = clipRepository(db)
      .listByStatus(projectId, ["rendering"])
      .map((clip) => clip.id)
    clipRepository(db).setStatus(rendering, "approved")
    if (project.status === "rendering") {
      projects.transition(projectId, "ready_for_review")
    } else {
      projects.transition(projectId, "cancelled")
    }
  })
}

export async function deleteProject(
  db: Db,
  storage: StorageAdapter,
  projectId: string
) {
  const projects = projectRepository(db)
  projects.getOrThrow(projectId)
  withTransaction(db, () => {
    jobQueue(db).cancelForProject(projectId)
    projects.delete(projectId)
  })
  try {
    await storage.removePrefix(storageKeys.projectPrefix(projectId))
  } catch (error) {
    logger.warn({ err: error, projectId }, "failed to remove project files")
  }
}
