import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { clipRepository } from "../clips/repository"
import { autoEffectsFor } from "../effects/service"
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
  if (project.settings.autoEffects !== parsed.data.autoEffects) {
    await syncAutoEffects(db, projectId, parsed.data.autoEffects)
  }
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

async function syncAutoEffects(db: Db, projectId: string, on: boolean) {
  const clips = clipRepository(db)
  const unedited = (await clips.listForProject(projectId)).filter(
    (clip) => !clip.effects?.edited
  )
  const tracks = on ? await autoEffectsFor(db, projectId, unedited) : null
  for (const clip of unedited) {
    await clips.update(clip.id, { effects: tracks?.get(clip.id) ?? null })
  }
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

export async function findMoreHighlights(db: Db, projectId: string) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (
    !["awaiting_layout", "ready_for_review", "done"].includes(project.status)
  ) {
    throw new AppError(
      "CONFLICT",
      isRunning(project.status)
        ? "Wait for the current step to finish"
        : "Highlights haven't been found yet"
    )
  }
  await withTransaction(db, async (tx) => {
    await projectRepository(tx).transition(projectId, "selecting")
    await jobQueue(tx).enqueue({
      type: "select",
      projectId,
      payload: { more: true },
    })
  })
}
