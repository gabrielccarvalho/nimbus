import "server-only"

import { eq } from "drizzle-orm"
import type { z } from "zod"

import type { Db } from "@/lib/db"
import { projects, workspaceMembers, workspaces } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"
import { storageKeys } from "@/lib/storage"
import type { StorageAdapter } from "@/lib/storage/types"

import { deleteProject } from "../projects/service"
import { encryptSecret } from "./crypto"
import { accountRepository } from "./repository"
import { anthropicKeySchema, keyHint, nameSchema } from "./schema"

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid value"
    )
  }
  return parsed.data
}

export async function renameWorkspace(
  db: Db,
  workspaceId: string,
  name: unknown
) {
  await accountRepository(db).renameWorkspace(
    workspaceId,
    parse(nameSchema, name)
  )
}

export async function saveAnthropicKey(
  db: Db,
  workspaceId: string,
  key: unknown
) {
  const value = parse(anthropicKeySchema, key)
  await accountRepository(db).setAnthropicKey(
    workspaceId,
    encryptSecret(value),
    keyHint(value)
  )
  return { hint: keyHint(value) }
}

export async function removeAnthropicKey(db: Db, workspaceId: string) {
  await accountRepository(db).setAnthropicKey(workspaceId, null, null)
}

export async function deleteOwnedWorkspaces(
  db: Db,
  storage: StorageAdapter,
  userId: string
) {
  const owned = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
  for (const { id } of owned) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, id))
    for (const project of rows) await deleteProject(db, storage, project.id)
    await storage.removePrefix(storageKeys.avatarPrefix("workspaces", id))
    await db.delete(workspaces).where(eq(workspaces.id, id))
  }
  await storage.removePrefix(storageKeys.avatarPrefix("users", userId))
}
