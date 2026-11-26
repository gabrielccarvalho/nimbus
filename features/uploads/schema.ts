import { z } from "zod"

import type { UploadTarget } from "@/lib/storage/types"

import type { MusicTrackSummary } from "../music/schema"

export const startUploadSchema = z.object({
  kind: z.enum(["video", "music"]),
  fileName: z.string().max(255),
  mime: z.string().max(255),
  bytes: z.number().int().nonnegative(),
  options: z.unknown().optional(),
})

export type StartUploadInput = z.infer<typeof startUploadSchema>
export type UploadKind = StartUploadInput["kind"]

export const SIGN_PARTS_MAX = 100

const partNumber = (partCount: number) => z.number().int().min(1).max(partCount)

export const signPartsSchema = (partCount: number) =>
  z.array(partNumber(partCount)).min(1).max(SIGN_PARTS_MAX)

export const uploadedPartsSchema = (partCount: number) =>
  z
    .array(
      z.object({
        partNumber: partNumber(partCount),
        etag: z.string().min(1).max(256),
      })
    )
    .length(partCount)
    .refine((parts) => parts.every((part, i) => part.partNumber === i + 1))

export type StartedUpload = {
  token: string
  target: UploadTarget
}

export type CompletedUpload = {
  video: { projectId: string }
  music: { trackId: string; track: MusicTrackSummary }
}
