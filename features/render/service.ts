import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import { layoutRepository } from "../layout/repository"
import { enqueueClipRenders } from "../projects/service"
import { projectRepository } from "../projects/repository"

const RENDERABLE = new Set(["approved", "rendered", "failed"])

export function startClipRenders(db: Db, projectId: string, clipIds: string[]) {
  const projects = projectRepository(db)
  const project = projects.getOrThrow(projectId)
  if (!["ready_for_review", "done", "rendering"].includes(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Finish reviewing the project before rendering"
    )
  }
  if (!layoutRepository(db).get(projectId)?.confirmedByUser) {
    throw new AppError("CONFLICT", "Confirm the layout before rendering")
  }
  const clips = clipRepository(db)
    .listForProject(projectId)
    .filter((clip) => clipIds.includes(clip.id))
  if (clips.length !== clipIds.length) {
    throw new AppError("NOT_FOUND", "Clip not found")
  }
  if (
    clips.length === 0 ||
    clips.some((clip) => !RENDERABLE.has(clip.status))
  ) {
    throw new AppError("VALIDATION", "Approve clips before rendering them")
  }
  withTransaction(db, () => {
    if (project.status !== "rendering")
      projects.transition(projectId, "rendering")
    enqueueClipRenders(db, projectId, clipIds)
  })
  return clips.length
}

export function startEditRender(db: Db, projectId: string) {
  const project = projectRepository(db).getOrThrow(projectId)
  if (!["ready_for_review", "rendering", "done"].includes(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Wait for analysis to finish before rendering the edit"
    )
  }
  const queue = jobQueue(db)
  if (queue.countActive(projectId, ["render_edit"]) > 0) {
    throw new AppError("CONFLICT", "The edit is already rendering")
  }
  return queue.enqueue({ type: "render_edit", projectId, payload: {} })
}

export function settleRendering(db: Db, projectId: string) {
  const projects = projectRepository(db)
  const project = projects.get(projectId)
  if (project?.status !== "rendering") return
  if (jobQueue(db).countActive(projectId, ["render_clip"]) > 0) return
  const rendered = clipRepository(db).listByStatus(projectId, ["rendered"])
  projects.transition(
    projectId,
    rendered.length > 0 ? "done" : "ready_for_review"
  )
}
