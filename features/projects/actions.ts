"use server"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId as parseAnyId, runAction as run } from "@/lib/server-action"
import { getStorage } from "@/lib/storage"

import { projectRepository } from "./repository"
import { projectNameSchema } from "./schema"
import { cancelProject, deleteProject, retryProject } from "./service"

const parseId = (input: unknown) => parseAnyId(input, "project id")

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
    () => {
      const parsed = projectNameSchema.safeParse(name)
      if (!parsed.success) {
        throw new AppError("VALIDATION", "Name must be 1–120 characters")
      }
      projectRepository(getDb()).getOrThrow(id)
      projectRepository(getDb()).rename(id, parsed.data)
    },
    ["/"]
  )
}
