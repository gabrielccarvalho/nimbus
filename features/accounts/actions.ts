"use server"

import { getDb } from "@/lib/db"
import { runAction } from "@/lib/server-action"

import { workspaceId } from "./session"
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
