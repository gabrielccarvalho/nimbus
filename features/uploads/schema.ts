import { z } from "zod"

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

export type StartedUpload = {
  token: string
  target: { url: string; method: "PUT"; headers: Record<string, string> }
}

export type CompletedUpload = {
  video: { projectId: string }
  music: { trackId: string; track: MusicTrackSummary }
}
