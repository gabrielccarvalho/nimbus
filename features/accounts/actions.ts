"use server"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { runAction } from "@/lib/server-action"
import { getStorage, type AvatarOwner } from "@/lib/storage"

import { removeAvatar, saveAvatar } from "./avatar"
import { requireActor, workspaceId } from "./session"
import {
  removeAnthropicKey,
  renameWorkspace,
  saveAnthropicKey,
} from "./service"

export async function renameWorkspaceAction(name: unknown) {
  return runAction(
    "renameWorkspace",
    async () => renameWorkspace(getDb(), await workspaceId(), name),
    ["/"]
  )
}

export async function saveAnthropicKeyAction(key: unknown) {
  return runAction(
    "saveAnthropicKey",
    async () => saveAnthropicKey(getDb(), await workspaceId(), key),
    ["/"]
  )
}

export async function removeAnthropicKeyAction() {
  return runAction(
    "removeAnthropicKey",
    async () => removeAnthropicKey(getDb(), await workspaceId()),
    ["/"]
  )
}

async function avatarOwner(target: unknown): Promise<[AvatarOwner, string]> {
  if (target === "user") return ["users", (await requireActor()).user.id]
  if (target === "workspace") return ["workspaces", await workspaceId()]
  throw new AppError("VALIDATION", "Unknown avatar")
}

export async function updateAvatarAction(target: unknown, form: FormData) {
  return runAction(
    "updateAvatar",
    async () => {
      const [owner, id] = await avatarOwner(target)
      return saveAvatar(getDb(), getStorage(), owner, id, form.get("image"))
    },
    ["/"]
  )
}

export async function removeAvatarAction(target: unknown) {
  return runAction(
    "removeAvatar",
    async () => {
      const [owner, id] = await avatarOwner(target)
      await removeAvatar(getDb(), getStorage(), owner, id)
    },
    ["/"]
  )
}
