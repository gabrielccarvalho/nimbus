import "server-only"

import { getEnv } from "@/lib/env"

import { LocalStorage } from "./local"
import type { StorageAdapter } from "./types"

let instance: { root: string; storage: StorageAdapter } | undefined

export function getStorage(): StorageAdapter {
  const root = getEnv().DATA_DIR
  if (!instance || instance.root !== root) {
    instance = { root, storage: new LocalStorage(root) }
  }
  return instance.storage
}

export const storageKeys = {
  projectPrefix: (projectId: string) => `projects/${projectId}`,
  source: (projectId: string, ext: string) =>
    `projects/${projectId}/source.${ext}`,
  audio: (projectId: string) => `projects/${projectId}/audio.wav`,
  thumbnail: (projectId: string) => `projects/${projectId}/thumbnail.jpg`,
  proxy: (projectId: string) => `projects/${projectId}/proxy.mp4`,
  render: (projectId: string, clipId: string, stamp: number) =>
    `projects/${projectId}/renders/${clipId}-${stamp}.mp4`,
  edit: (projectId: string, stamp: number) =>
    `projects/${projectId}/renders/edit-${stamp}.mp4`,
  work: (projectId: string, name: string) =>
    `projects/${projectId}/work/${name}`,
  uploadTemp: (id: string) => `tmp/uploads/${id}.part`,
}

const SERVABLE_KEY =
  /^projects\/[\w-]+\/(?:renders\/)?[\w.-]+\.(?:mp4|mov|mkv|webm|wav|jpg)$/

export function isServableKey(key: string) {
  return SERVABLE_KEY.test(key) && !key.includes("..")
}

export type { StorageAdapter } from "./types"
