import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { syncAutoEffects } from "../effects/service"
import { assetRepository, projectRepository } from "../projects/repository"
import { layoutRepository } from "./repository"
import { usesWebcam, type LayoutInput } from "./schema"

export async function confirmLayout(
  db: Db,
  projectId: string,
  input: LayoutInput,
  options: { confidence?: number; savePreset?: boolean } = {}
) {
  const project = await projectRepository(db).getOrThrow(projectId)
  if (project.status === "rendering") {
    throw new AppError(
      "CONFLICT",
      "Wait for rendering to finish before changing the layout"
    )
  }
  if (usesWebcam(input.mode) && !input.webcamRect) {
    throw new AppError(
      "VALIDATION",
      "Mark the webcam before using a webcam layout"
    )
  }
  const source = await assetRepository(db).findByKind(projectId, "source")
  const current = await layoutRepository(db).get(projectId)
  if (!current || !source?.width || !source.height) {
    throw new AppError("CONFLICT", "Wait for the probe step to finish")
  }
  const { width, height } = source

  return withTransaction(db, async (tx) => {
    const layouts = layoutRepository(tx)
    const layout = await layouts.upsert(projectId, {
      ...input,
      sourceAspect: current.sourceAspect,
      confidence: options.confidence ?? current.confidence,
      confirmedByUser: true,
    })
    if (options.savePreset) {
      await layouts.savePreset(width, height, input)
    }
    if (project.settings.autoEffects) {
      await syncAutoEffects(tx, projectId, true, (clip) => !clip.layoutOverride)
    }
    if (project.status === "awaiting_layout") {
      await projectRepository(tx).transition(projectId, "ready_for_review")
    }
    return layout
  })
}
