import "server-only"

import type { Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { assetRepository, projectRepository } from "../projects/repository"
import { layoutRepository } from "./repository"
import type { LayoutInput } from "./schema"

export function confirmLayout(
  db: Db,
  projectId: string,
  input: LayoutInput,
  options: { confidence?: number; savePreset?: boolean } = {}
) {
  const projects = projectRepository(db)
  const project = projects.getOrThrow(projectId)
  if (project.status === "rendering") {
    throw new AppError(
      "CONFLICT",
      "Wait for rendering to finish before changing the layout"
    )
  }
  if (input.mode !== "no-cam-blur-fill" && !input.webcamRect) {
    throw new AppError(
      "VALIDATION",
      "Mark the webcam before using a webcam layout"
    )
  }
  const layouts = layoutRepository(db)
  const source = assetRepository(db).findByKind(projectId, "source")
  const current = layouts.get(projectId)
  if (!current || !source?.width || !source.height) {
    throw new AppError("CONFLICT", "Wait for the probe step to finish")
  }

  const layout = layouts.upsert(projectId, {
    ...input,
    sourceAspect: current.sourceAspect,
    confidence: options.confidence ?? current.confidence,
    confirmedByUser: true,
  })
  if (options.savePreset) layouts.savePreset(source.width, source.height, input)
  if (project.status === "awaiting_layout") {
    projects.transition(projectId, "ready_for_review")
  }
  return layout
}
