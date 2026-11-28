"use server"

import { and, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"

import { getDb } from "@/lib/db"
import { session } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_OPTIONS,
} from "@/lib/i18n/config"
import { runAction } from "@/lib/server-action"
import { getStorage, type AvatarOwner } from "@/lib/storage"

import { getAuth } from "./auth"
import { removeAvatar, saveAvatar } from "./avatar"
import { accountRepository } from "./repository"
import { getSession, requireActor, workspaceId } from "./session"
import {
  removeAnthropicKey,
  removeGroqKey,
  renameWorkspace,
  saveAnthropicKey,
  saveGroqKey,
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

export async function saveGroqKeyAction(key: unknown) {
  return runAction(
    "saveGroqKey",
    async () => saveGroqKey(getDb(), await workspaceId(), key),
    ["/"]
  )
}

export async function removeGroqKeyAction() {
  return runAction(
    "removeGroqKey",
    async () => removeGroqKey(getDb(), await workspaceId()),
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

export async function revokeSessionAction(sessionId: unknown) {
  return runAction(
    "revokeSession",
    async () => {
      const viewer = await requireActor()
      if (typeof sessionId !== "string" || sessionId === viewer.session.id) {
        throw new AppError("VALIDATION", "Choose another session")
      }
      const [target] = await getDb()
        .select({ token: session.token })
        .from(session)
        .where(
          and(eq(session.id, sessionId), eq(session.userId, viewer.user.id))
        )
      if (!target) throw new AppError("NOT_FOUND", "Session not found")
      await getAuth().api.revokeSession({
        body: { token: target.token },
        headers: await headers(),
      })
    },
    ["/settings/security"]
  )
}

// The cookie is what pages read. The account keeps the choice for the next browser.
export async function setLocaleAction(locale: unknown) {
  return runAction(
    "setLocale",
    async () => {
      if (!isLocale(locale))
        throw new AppError("VALIDATION", "Unknown language")
      const viewer = await getSession()
      if (viewer) {
        await accountRepository(getDb()).setUserLocale(viewer.user.id, locale)
      }
      const cookieStore = await cookies()
      cookieStore.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS)
    },
    ["/"]
  )
}
