import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import { isRunning } from "../pipeline/state-machine"
import { startClipRenders } from "../render/service"
import { projectRepository } from "./repository"
import { rerunStepFor, type RerunStep } from "./rerun"
import { projectSettingsSchema } from "./schema"

export async function updateProjectSettings(
  db: Db,
  projectId: string,
  input: unknown
) {
  const parsed = projectSettingsSchema.safeParse(input)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid settings"
    )
  }
  const projects = projectRepository(db)
  const project = await projects.getOrThrow(projectId)
  if (isRunning(project.status)) {
    throw new AppError(
      "CONFLICT",
      "Wait for the current step to finish before changing settings"
    )
  }
  await projects.updateSettings(projectId, parsed.data)
  const step = rerunStepFor(project.settings, parsed.data)
  if (!step || !project.sourceAssetId) return { rerun: null }
  if (step === "render") {
    const rendered = await clipRepository(db).listByStatus(projectId, [
      "rendered",
    ])
    return { rerun: rendered.length > 0 ? step : null }
  }
  return { rerun: step }
}

export async function rerunProject(db: Db, projectId: string, step: RerunStep) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (isRunning(project.status)) {
    throw new AppError("CONFLICT", "Wait for the current step to finish")
  }
  if (!project.sourceAssetId) {
    throw new AppError("CONFLICT", "The video hasn't finished importing")
  }
  if (step === "render") {
    const rendered = await clipRepository(db).listByStatus(projectId, [
      "rendered",
    ])
    if (rendered.length === 0) {
      throw new AppError("CONFLICT", "There are no rendered clips to redo")
    }
    return startClipRenders(
      db,
      projectId,
      rendered.map((clip) => clip.id)
    )
  }
  await withTransaction(db, async (tx) => {
    await projectRepository(tx).transition(
      projectId,
      step === "transcribe" ? "transcribing" : "selecting"
    )
    await jobQueue(tx).enqueue({ type: step, projectId })
  })
  return 0
}
