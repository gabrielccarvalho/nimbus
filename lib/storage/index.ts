import "server-only"

import { mkdirSync } from "node:fs"

import { getEnv } from "@/lib/env"

import { LocalStorage } from "./local"
import type { StorageAdapter } from "./types"

let instance: { root: string; storage: StorageAdapter } | undefined

export function getStorage(): StorageAdapter {
  const root = getEnv().DATA_DIR
  if (!instance || instance.root !== root) {
    mkdirSync(root, { recursive: true })
    instance = { root, storage: new LocalStorage(root) }
  }
  return instance.storage
}

export const storageKeys = {
  projectPrefix: (projectId: string) => `projects/${projectId}`,
  source: (projectId: string, ext: string) =>
    `projects/${projectId}/source.${ext}`,
  audio: (projectId: string) => `projects/${projectId}/audio.wav`,
  languageSample: (projectId: string, id: string) =>
    `projects/${projectId}/work/language-sample-${id}.wav`,
  thumbnail: (projectId: string) => `projects/${projectId}/thumbnail.jpg`,
  proxy: (projectId: string) => `projects/${projectId}/proxy.mp4`,
  render: (projectId: string, clipId: string, stamp: number) =>
    `projects/${projectId}/renders/${clipId}-${stamp}.mp4`,
  edit: (projectId: string, stamp: number) =>
    `projects/${projectId}/renders/edit-${stamp}.mp4`,
  work: (projectId: string, name: string) =>
    `projects/${projectId}/work/${name}`,
  avatar: (owner: AvatarOwner, id: string, stamp: number, ext: string) =>
    `avatars/${owner}/${id}/${stamp}.${ext}`,
  avatarPrefix: (owner: AvatarOwner, id: string) => `avatars/${owner}/${id}`,
  uploadTemp: (id: string) => `tmp/uploads/${id}.part`,
  downloadDir: (id: string) => `tmp/downloads/${id}`,
}

const SERVABLE_KEY =
  /^projects\/[\w-]+\/(?:renders\/)?[\w.-]+\.(?:mp4|mov|mkv|webm|wav|jpg)$/

export function isServableKey(key: string) {
  return SERVABLE_KEY.test(key) && !key.includes("..")
}

export type AvatarOwner = "users" | "workspaces"

const AVATAR_KEY =
  /^avatars\/(users|workspaces)\/([\w-]+)\/\d+\.(?:png|jpg|webp)$/

export function parseAvatarKey(key: string) {
  const match = AVATAR_KEY.exec(key)
  if (!match || key.includes("..")) return null
  return { owner: match[1] as AvatarOwner, id: match[2]! }
}

export type { StorageAdapter } from "./types"
