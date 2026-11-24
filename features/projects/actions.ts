"use server"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId as parseAnyId, runAction as run } from "@/lib/server-action"
import { getStorage } from "@/lib/storage"

import { projectRepository } from "./repository"
import { rerunSteps } from "./rerun"
import { projectNameSchema } from "./schema"
import { cancelProject, deleteProject, retryProject } from "./service"
import {
  findMoreHighlights,
  rerunProject,
  updateProjectSettings,
} from "./settings-service"

const parseId = (input: unknown) => parseAnyId(input, "project id")

export async function getSearchIndexAction() {
  return run(
    "getSearchIndex",
    () => projectRepository(getDb()).searchIndex(),
    []
  )
}

export async function deleteProjectAction(projectId: unknown) {
  return run(
    "deleteProject",
    async () => {
      await deleteProject(getDb(), getStorage(), parseId(projectId))
    },
    ["/"]
  )
}

export async function retryProjectAction(projectId: unknown) {
  const id = parseId(projectId)
  return run("retryProject", () => retryProject(getDb(), id), [
    `/projects/${id}`,
  ])
}

export async function cancelProjectAction(projectId: unknown) {
  const id = parseId(projectId)
  return run("cancelProject", () => cancelProject(getDb(), id), [
    `/projects/${id}`,
  ])
}

export async function renameProjectAction(projectId: unknown, name: unknown) {
  const id = parseId(projectId)
  return run(
    "renameProject",
    async () => {
      const parsed = projectNameSchema.safeParse(name)
      if (!parsed.success) {
        throw new AppError("VALIDATION", "Name must be 1–120 characters")
      }
      const projects = projectRepository(getDb())
      await projects.getOrThrow(id)
      await projects.rename(id, parsed.data)
    },
    ["/"]
  )
}

export async function updateProjectSettingsAction(
  projectId: unknown,
  settings: unknown
) {
  const id = parseId(projectId)
  return run(
    "updateProjectSettings",
    () => updateProjectSettings(getDb(), id, settings),
    [`/projects/${id}`]
  )
}

export async function rerunProjectAction(projectId: unknown, step: unknown) {
  const id = parseId(projectId)
  return run(
    "rerunProject",
    async () => {
      const parsed = z.enum(rerunSteps).safeParse(step)
      if (!parsed.success) throw new AppError("VALIDATION", "Unknown step")
      await rerunProject(getDb(), id, parsed.data)
    },
    [`/projects/${id}`]
  )
}

export async function findMoreHighlightsAction(projectId: unknown) {
  const id = parseId(projectId)
  return run("findMoreHighlights", () => findMoreHighlights(getDb(), id), [
    `/projects/${id}`,
  ])
}
