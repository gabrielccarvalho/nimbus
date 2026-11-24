import { AppError } from "@/lib/errors"
import { getDb } from "@/lib/db"
import { projectRepository } from "@/features/projects/repository"

export const testViewer: { workspaceId: string | null } = { workspaceId: null }

async function workspaceId() {
  return testViewer.workspaceId
}

async function assertProjectAccess(projectId: string) {
  const project = await projectRepository(getDb()).get(projectId)
  if (!project || project.workspaceId !== testViewer.workspaceId) {
    throw new AppError("NOT_FOUND", "Project not found")
  }
  return project
}

export const sessionMock = {
  workspaceId,
  assertProjectAccess,
  forProject:
    <T>(projectId: string, fn: () => T | Promise<T>) =>
    async () => {
      await assertProjectAccess(projectId)
      return fn()
    },
}
