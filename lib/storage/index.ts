import "server-only"

import { mkdirSync } from "node:fs"
import path from "node:path"

import { S3Client } from "@aws-sdk/client-s3"

import { getEnv, type Env } from "@/lib/env"

import { LocalStorage } from "./local"
import { S3Storage } from "./s3"
import type { StorageAdapter } from "./types"

let instance: { root: string; storage: StorageAdapter } | undefined

export function getStorage(): StorageAdapter {
  const env = getEnv()
  const root = env.STORAGE_DRIVER === "s3" ? "s3" : env.DATA_DIR
  if (!instance || instance.root !== root) {
    instance = { root, storage: createStorage(env) }
  }
  return instance.storage
}

export function createS3Client(env: Env, endpoint = env.S3_ENDPOINT) {
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    // The default adds a CRC32 of the empty body to presigned PUTs, which
    // then rejects every real upload.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
}

function createStorage(env: Env): StorageAdapter {
  if (env.STORAGE_DRIVER === "local") {
    mkdirSync(env.DATA_DIR, { recursive: true })
    return new LocalStorage(env.DATA_DIR)
  }
  return new S3Storage({
    client: createS3Client(env),
    signer: env.S3_PUBLIC_ENDPOINT
      ? createS3Client(env, env.S3_PUBLIC_ENDPOINT)
      : undefined,
    bucket: env.S3_BUCKET!,
    cache: {
      dir: path.join(env.SCRATCH_DIR, "cache"),
      maxBytes: env.SCRATCH_CACHE_BYTES,
    },
  })
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
  avatar: (owner: AvatarOwner, id: string, stamp: number, ext: string) =>
    `avatars/${owner}/${id}/${stamp}.${ext}`,
  avatarPrefix: (owner: AvatarOwner, id: string) => `avatars/${owner}/${id}`,
  music: (workspaceId: string, trackId: string, ext: string) =>
    `music/${workspaceId}/${trackId}.${ext}`,
  musicPrefix: (workspaceId: string) => `music/${workspaceId}`,
  uploadTemp: (id: string) => `tmp/uploads/${id}.part`,
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
