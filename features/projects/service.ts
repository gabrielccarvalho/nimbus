import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { storageKeys, type StorageAdapter } from "@/lib/storage"

import { assertRenderAllowance } from "../accounts/usage"
import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import { jobTypes } from "../jobs/schema"
import {
  isRunning,
  jobTypeForStep,
  retryTarget,
} from "../pipeline/state-machine"
import { projectRepository } from "./repository"

export async function enqueueClipRenders(
  db: Db,
  projectId: string,
  clipIds: string[]
) {
  const queue = jobQueue(db)
  await clipRepository(db).setStatus(clipIds, "rendering")
  for (const clipId of clipIds) {
    await queue.enqueue({ type: "render_clip", projectId, payload: { clipId } })
  }
}

export async function retryProject(db: Db, projectId: string) {
  const project = await projectRepository(db).getOrThrow(projectId)
  const target = retryTarget(project.status, project.failedStep)
  await withTransaction(db, async (tx) => {
    await projectRepository(tx).resumeFailed(projectId, target)
    const jobType = jobTypeForStep(target)
    if (jobType) {
      await jobQueue(tx).enqueue({ type: jobType, projectId })
      return
    }
    const retryable = await clipRepository(tx).listByStatus(projectId, [
      "failed",
      "rendering",
      "approved",
    ])
    if (retryable.length === 0) {
      throw new AppError("CONFLICT", "There are no clips to render")
    }
    await assertRenderAllowance(tx, project.workspaceId, retryable)
    await enqueueClipRenders(
      tx,
      projectId,
      retryable.map((clip) => clip.id)
    )
  })
}

export async function cancelProject(db: Db, projectId: string) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (!isRunning(project.status)) {
    throw new AppError("CONFLICT", "Nothing is running for this project")
  }
  await withTransaction(db, async (tx) => {
    await jobQueue(tx).cancelForProject(
      projectId,
      jobTypes.filter((type) => type !== "publish_clip")
    )
    const clips = clipRepository(tx)
    const rendering = (await clips.listByStatus(projectId, ["rendering"])).map(
      (clip) => clip.id
    )
    await clips.setStatus(rendering, "approved")
    await projectRepository(tx).transition(
      projectId,
      project.status === "rendering" ? "ready_for_review" : "cancelled"
    )
  })
}

export async function deleteProject(
  db: Db,
  storage: StorageAdapter,
  projectId: string
) {
  await projectRepository(db).getOrThrow(projectId)
  await withTransaction(db, async (tx) => {
    await jobQueue(tx).cancelForProject(projectId)
    await projectRepository(tx).delete(projectId)
  })
  try {
    await storage.removePrefix(storageKeys.projectPrefix(projectId))
  } catch (error) {
    logger.warn({ err: error, projectId }, "failed to remove project files")
  }
}
