import "server-only"

import type { Readable } from "node:stream"

import { getDb, newId } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"

import { AUDIO_MAGIC_BYTES, trackTitleFromFile } from "../music/media"
import { MUSIC_FORMATS } from "../music/schema"
import {
  audioCheck,
  createProcessingTrack,
  musicUploadMime,
  sniffMusic,
} from "../music/service"
import {
  ACCEPTED_VIDEO_TYPES,
  MAGIC_BYTES_NEEDED,
  type AcceptedVideoMime,
} from "../projects/media-type"
import {
  assertVideoHead,
  createUploadedProject,
  magicByteCheck,
  parseImportOptions,
  videoUploadMime,
} from "../projects/upload"
import {
  startUploadSchema,
  type CompletedUpload,
  type StartedUpload,
} from "./schema"
import { signUploadToken, verifyUploadToken } from "./token"

export type UploadActor = { userId: string; workspaceId: string }

const UPLOAD_TTL_MS = 60 * 60_000

const missing = () => new AppError("NOT_FOUND", "The upload didn't arrive")

const incomplete = () =>
  new AppError("VALIDATION", "The upload didn't finish. Try again.")

export async function startUpload(
  input: unknown,
  actor: UploadActor,
  now = Date.now()
): Promise<StartedUpload> {
  const parsed = startUploadSchema.safeParse(input)
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid upload")
  const { kind, fileName, bytes } = parsed.data
  const mime =
    kind === "video"
      ? videoUploadMime(parsed.data)
      : musicUploadMime(parsed.data)
  const options =
    kind === "video" ? parseImportOptions(parsed.data.options) : undefined
  if (bytes === 0) throw new AppError("VALIDATION", "The upload was empty")

  const key = storageKeys.uploadTemp(newId())
  const token = signUploadToken({
    kind,
    key,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    fileName,
    mime,
    bytes,
    options,
    exp: now + UPLOAD_TTL_MS,
  })
  const target = await getStorage().uploadTarget(key, {
    bytes,
    contentType: mime,
  })
  return {
    token,
    target: target.url
      ? target
      : {
          url: `/api/uploads/${token}`,
          method: "PUT",
          headers: { "Content-Type": mime },
        },
  }
}

export async function receiveUpload(token: string, body: Readable) {
  const claim = verifyUploadToken(token)
  const storage = getStorage()
  const { bytes } = await storage.write(claim.key, body, {
    maxBytes: claim.bytes,
    transforms: [
      claim.kind === "video"
        ? magicByteCheck(claim.mime as AcceptedVideoMime)
        : audioCheck(),
    ],
  })
  if (bytes !== claim.bytes) {
    await storage.remove(claim.key)
    throw incomplete()
  }
}

async function readHead(key: string, bytes: number) {
  const chunks = await getStorage()
    .read(key, { start: 0, end: bytes - 1 })
    .toArray()
  return Buffer.concat(chunks)
}

export async function completeUpload(
  token: string,
  actor: UploadActor
): Promise<CompletedUpload[keyof CompletedUpload]> {
  const claim = verifyUploadToken(token)
  if (
    claim.workspaceId !== actor.workspaceId ||
    claim.userId !== actor.userId
  ) {
    throw missing()
  }
  const storage = getStorage()
  const stored = await storage.stat(claim.key)
  if (!stored) throw missing()
  try {
    if (stored.bytes !== claim.bytes) throw incomplete()
    if (claim.kind === "video") {
      const mime = claim.mime as AcceptedVideoMime
      assertVideoHead(await readHead(claim.key, MAGIC_BYTES_NEEDED), mime)
      const projectId = newId()
      const sourceKey = storageKeys.source(
        projectId,
        ACCEPTED_VIDEO_TYPES[mime]
      )
      await storage.move(claim.key, sourceKey)
      return await createUploadedProject({
        projectId,
        sourceKey,
        fileName: claim.fileName,
        mime,
        bytes: claim.bytes,
        options: claim.options,
        workspaceId: claim.workspaceId,
      })
    }
    const format = sniffMusic(await readHead(claim.key, AUDIO_MAGIC_BYTES))
    const id = newId()
    const storageKey = storageKeys.music(actor.workspaceId, id, format)
    await storage.move(claim.key, storageKey)
    const track = await createProcessingTrack(getDb(), {
      id,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      title: trackTitleFromFile(claim.fileName),
      storageKey,
      mime: MUSIC_FORMATS[format],
      bytes: claim.bytes,
    })
    return { trackId: track.id, track }
  } catch (error) {
    await storage.remove(claim.key)
    throw error
  }
}
