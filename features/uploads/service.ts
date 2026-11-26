import "server-only"

import type { Readable } from "node:stream"

import { getDb, newId } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { getStorage, storageKeys } from "@/lib/storage"

import { AUDIO_MAGIC_BYTES, trackTitleFromFile } from "../music/media"
import { musicRepository } from "../music/repository"
import { MUSIC_FORMATS, type MusicFormat } from "../music/schema"
import {
  assertMusicFormat,
  audioCheck,
  createProcessingTrack,
  musicUploadFormat,
} from "../music/service"
import {
  ACCEPTED_VIDEO_TYPES,
  MAGIC_BYTES_NEEDED,
  type AcceptedVideoMime,
} from "../projects/media-type"
import { projectRepository } from "../projects/repository"
import {
  assertVideoHead,
  createUploadedProject,
  magicByteCheck,
  parseImportOptions,
  videoUploadMime,
} from "../projects/upload"
import {
  signPartsSchema,
  startUploadSchema,
  uploadedPartsSchema,
  type CompletedUpload,
  type StartedUpload,
} from "./schema"
import { signUploadToken, verifyUploadToken, type UploadClaim } from "./token"

export type UploadActor = { userId: string; workspaceId: string }

const UPLOAD_TTL_MS = 60 * 60_000
export const COMPLETE_TTL_MS = 24 * 60 * 60_000

const missing = () => new AppError("NOT_FOUND", "The upload didn't arrive")

const incomplete = (cause?: unknown) =>
  new AppError("VALIDATION", "The upload didn't finish. Try again.", { cause })

export async function startUpload(
  input: unknown,
  actor: UploadActor,
  now = Date.now()
): Promise<StartedUpload> {
  const parsed = startUploadSchema.safeParse(input)
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid upload")
  const { kind, fileName, bytes } = parsed.data
  const id = newId()
  let key: string
  let mime: string
  if (kind === "video") {
    const video = videoUploadMime(parsed.data)
    key = storageKeys.source(id, ACCEPTED_VIDEO_TYPES[video])
    mime = video
  } else {
    const format = musicUploadFormat(parsed.data)
    key = storageKeys.music(actor.workspaceId, id, format)
    mime = MUSIC_FORMATS[format]
  }
  const options =
    kind === "video" ? parseImportOptions(parsed.data.options) : undefined
  if (bytes === 0) throw new AppError("VALIDATION", "The upload was empty")

  const target = await getStorage().uploadTarget(key, {
    bytes,
    contentType: mime,
  })
  const token = signUploadToken({
    kind,
    id,
    key,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    fileName,
    mime,
    bytes,
    options,
    multipart:
      target?.kind === "multipart"
        ? {
            uploadId: target.uploadId,
            partSize: target.partSize,
            partCount: target.partCount,
          }
        : undefined,
    exp: now + UPLOAD_TTL_MS,
    completeBy: now + COMPLETE_TTL_MS,
  })
  return {
    token,
    target: target ?? {
      kind: "single",
      url: `/api/uploads/${token}`,
      method: "PUT",
      headers: { "Content-Type": mime },
    },
  }
}

function claimFor(token: string, actor: UploadActor) {
  const claim = verifyUploadToken(token, "completeBy")
  if (
    claim.workspaceId !== actor.workspaceId ||
    claim.userId !== actor.userId
  ) {
    throw missing()
  }
  return claim
}

async function alreadyCompleted(claim: UploadClaim) {
  const db = getDb()
  const row =
    claim.kind === "video"
      ? await projectRepository(db).get(claim.id)
      : await musicRepository(db).get(claim.id)
  return Boolean(row)
}

function claimedFormat(claim: UploadClaim) {
  return claim.key.split(".").pop() as MusicFormat
}

export async function signUploadParts(
  token: string,
  partNumbers: unknown,
  actor: UploadActor
) {
  const claim = claimFor(token, actor)
  if (!claim.multipart) throw new AppError("VALIDATION", "Invalid upload")
  const parsed = signPartsSchema(claim.multipart.partCount).safeParse(
    partNumbers
  )
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid upload parts")
  return getStorage().signUploadParts(
    claim.key,
    { ...claim.multipart, bytes: claim.bytes },
    parsed.data
  )
}

export async function receiveUpload(token: string, body: Readable) {
  const claim = verifyUploadToken(token)
  if (await alreadyCompleted(claim)) {
    throw new AppError("CONFLICT", "This upload is already complete")
  }
  const storage = getStorage()
  const { bytes } = await storage.write(claim.key, body, {
    maxBytes: claim.bytes,
    transforms: [
      claim.kind === "video"
        ? magicByteCheck(claim.mime as AcceptedVideoMime)
        : audioCheck(claimedFormat(claim)),
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
  parts: unknown,
  actor: UploadActor
): Promise<CompletedUpload[keyof CompletedUpload]> {
  const claim = claimFor(token, actor)
  if (await alreadyCompleted(claim)) throw missing()
  const storage = getStorage()
  const { multipart } = claim
  let assembled = !multipart
  try {
    if (multipart) {
      const parsed = uploadedPartsSchema(multipart.partCount).safeParse(parts)
      if (!parsed.success) throw incomplete()
      await storage
        .completeUpload(claim.key, multipart.uploadId, parsed.data)
        .catch((cause: unknown) => {
          throw incomplete(cause)
        })
      assembled = true
    }
    const stored = await storage.stat(claim.key)
    if (!stored) throw missing()
    if (stored.bytes !== claim.bytes) throw incomplete()
    if (claim.kind === "video") {
      const mime = claim.mime as AcceptedVideoMime
      assertVideoHead(await readHead(claim.key, MAGIC_BYTES_NEEDED), mime)
      return await createUploadedProject({
        projectId: claim.id,
        sourceKey: claim.key,
        fileName: claim.fileName,
        mime,
        bytes: claim.bytes,
        options: claim.options,
        workspaceId: claim.workspaceId,
      })
    }
    const format = claimedFormat(claim)
    assertMusicFormat(await readHead(claim.key, AUDIO_MAGIC_BYTES), format)
    const track = await createProcessingTrack(getDb(), {
      id: claim.id,
      workspaceId: claim.workspaceId,
      userId: claim.userId,
      title: trackTitleFromFile(claim.fileName),
      storageKey: claim.key,
      mime: MUSIC_FORMATS[format],
      bytes: claim.bytes,
    })
    return { trackId: track.id, track }
  } catch (error) {
    if (await alreadyCompleted(claim)) throw error
    if (assembled) {
      await storage.remove(claim.key)
    } else {
      // The sweep aborts it later if this fails too.
      await storage.abortUpload(claim.key, multipart!.uploadId).catch(() => {})
    }
    throw error
  }
}
