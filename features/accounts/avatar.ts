import "server-only"

import type { Db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseAvatarKey, storageKeys, type AvatarOwner } from "@/lib/storage"
import type { StorageAdapter } from "@/lib/storage/types"

import { accountRepository } from "./repository"

export const AVATAR_MAX_BYTES = 512 * 1024
const AVATAR_ROUTE = "/api/"

export function imageType(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to))
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
  return null
}

export function avatarUrl(key: string) {
  return `${AVATAR_ROUTE}${key}`
}

function storedKey(url: string | null | undefined) {
  if (!url?.startsWith(AVATAR_ROUTE)) return null
  const key = url.slice(AVATAR_ROUTE.length)
  return parseAvatarKey(key) ? key : null
}

async function currentImage(db: Db, owner: AvatarOwner, id: string) {
  const accounts = accountRepository(db)
  return owner === "users"
    ? accounts.userImage(id)
    : accounts.workspaceImage(id)
}

async function setImage(
  db: Db,
  owner: AvatarOwner,
  id: string,
  image: string | null
) {
  const accounts = accountRepository(db)
  if (owner === "users") await accounts.setUserImage(id, image)
  else await accounts.setWorkspaceImage(id, image)
}

export async function saveAvatar(
  db: Db,
  storage: StorageAdapter,
  owner: AvatarOwner,
  id: string,
  file: unknown
) {
  if (!(file instanceof Blob) || file.size === 0) {
    throw new AppError("VALIDATION", "Choose an image")
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AppError("VALIDATION", "That image is too large")
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = imageType(bytes)
  if (!ext) {
    throw new AppError("VALIDATION", "Use a PNG, JPEG or WebP image")
  }
  const previous = storedKey(await currentImage(db, owner, id))
  const key = storageKeys.avatar(owner, id, Date.now(), ext)
  await storage.writeBuffer(key, Buffer.from(bytes))
  const url = avatarUrl(key)
  await setImage(db, owner, id, url)
  if (previous) await storage.remove(previous)
  return { image: url }
}

export async function removeAvatar(
  db: Db,
  storage: StorageAdapter,
  owner: AvatarOwner,
  id: string
) {
  const previous = storedKey(await currentImage(db, owner, id))
  await setImage(db, owner, id, null)
  if (previous) await storage.remove(previous)
}
