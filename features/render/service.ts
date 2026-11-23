import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import { layoutRepository } from "../layout/repository"
import { enqueueClipRenders } from "../projects/service"
import { projectRepository } from "../projects/repository"

const RENDERABLE = new Set(["approved", "rendered", "failed"])

export async function startClipRenders(
  db: Db,
  projectId: string,
  clipIds: string[]
) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (!["ready_for_review", "done", "rendering"].includes(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Finish reviewing the project before rendering"
    )
  }
  if (!(await layoutRepository(db).get(projectId))?.confirmedByUser) {
    throw new AppError("CONFLICT", "Confirm the layout before rendering")
  }
  const clips = (await clipRepository(db).listForProject(projectId)).filter(
    (clip) => clipIds.includes(clip.id)
  )
  if (clips.length !== clipIds.length) {
    throw new AppError("NOT_FOUND", "Clip not found")
  }
  if (
    clips.length === 0 ||
    clips.some((clip) => !RENDERABLE.has(clip.status))
  ) {
    throw new AppError("VALIDATION", "Approve clips before rendering them")
  }
  await withTransaction(db, async (tx) => {
    if (project.status !== "rendering") {
      await projectRepository(tx).transition(projectId, "rendering")
    }
    await enqueueClipRenders(tx, projectId, clipIds)
  })
  return clips.length
}

export async function startEditRender(db: Db, projectId: string) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (!["ready_for_review", "rendering", "done"].includes(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Wait for analysis to finish before rendering the edit"
    )
  }
  const queue = jobQueue(db)
  if ((await queue.countActive(projectId, ["render_edit"])) > 0) {
    throw new AppError("CONFLICT", "The edit is already rendering")
  }
  return queue.enqueue({ type: "render_edit", projectId, payload: {} })
}

export async function cancelClipRenders(db: Db, projectId: string) {
  await projectRepository(db).getOrThrow(projectId)
  const cancelled = await withTransaction(db, async (tx) => {
    const count = await jobQueue(tx).cancelForProject(projectId, [
      "render_clip",
    ])
    if (count === 0) return 0
    const clips = clipRepository(tx)
    const rendering = (await clips.listByStatus(projectId, ["rendering"])).map(
      (clip) => clip.id
    )
    await clips.setStatus(rendering, "approved")
    return count
  })
  if (cancelled === 0) {
    throw new AppError("CONFLICT", "No clips are rendering")
  }
  await settleRendering(db, projectId)
}

export async function cancelEditRender(db: Db, projectId: string) {
  await projectRepository(db).getOrThrow(projectId)
  const cancelled = await jobQueue(db).cancelForProject(projectId, [
    "render_edit",
  ])
  if (cancelled === 0) {
    throw new AppError("CONFLICT", "The edit isn't rendering")
  }
}

export async function settleRendering(db: Db, projectId: string) {
  const projects = projectRepository(db)
  const project = await projects.get(projectId)
  if (project?.status !== "rendering") return
  if ((await jobQueue(db).countActive(projectId, ["render_clip"])) > 0) return
  const rendered = await clipRepository(db).listByStatus(projectId, [
    "rendered",
  ])
  await projects.transition(
    projectId,
    rendered.length > 0 ? "done" : "ready_for_review"
  )
}
