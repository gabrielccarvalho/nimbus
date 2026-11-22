"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError, err, ok, type Result } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getStorage } from "@/lib/storage"

import { projectRepository } from "./repository"
import { projectNameSchema } from "./schema"
import { cancelProject, deleteProject, retryProject } from "./service"

const idSchema = z.string().min(1).max(64)

function parseId(input: unknown) {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid project id")
  return parsed.data
}

async function run<T>(
  name: string,
  fn: () => T | Promise<T>,
  paths: string[]
): Promise<Result<T>> {
  try {
    const value = await fn()
    for (const path of paths) revalidatePath(path, "layout")
    return ok(value)
  } catch (error) {
    logger.warn({ err: error, action: name }, "action failed")
    return err(error)
  }
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
