import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { projectRepository } from "../projects/repository"
import { getAuth } from "./auth"
import { accountRepository } from "./repository"

export const getSession = cache(async () => {
  const result = await getAuth().api.getSession({ headers: await headers() })
  if (!result) return null
  const accounts = accountRepository(getDb())
  const workspace =
    (await accounts.workspaceForUser(result.user.id)) ??
    (await accounts.createPersonalWorkspace(result.user))
  return { user: result.user, session: result.session, workspace }
})

export type Viewer = NonNullable<Awaited<ReturnType<typeof getSession>>>

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getSession()
  if (!viewer) redirect("/login")
  return viewer
}

export async function requireActor(): Promise<Viewer> {
  const viewer = await getSession()
  if (!viewer) throw new AppError("UNAUTHORIZED", "Sign in to continue")
  return viewer
}

export async function workspaceId() {
  return (await requireActor()).workspace.id
}

export async function assertProjectAccess(projectId: string) {
  const workspace = await workspaceId()
  const project = await projectRepository(getDb()).get(projectId)
  if (!project || project.workspaceId !== workspace) {
    throw new AppError("NOT_FOUND", "Project not found")
  }
  return project
}

export function forProject<T>(projectId: string, fn: () => T | Promise<T>) {
  return async () => {
    await assertProjectAccess(projectId)
    return fn()
  }
}
