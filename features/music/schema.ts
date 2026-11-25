import { z } from "zod"

export const MUSIC_DB = { min: -30, max: 0, default: -16 } as const
export const SOURCE_DB = { min: -30, max: 6, default: 0 } as const
export const FADE_MAX_MS = 5000

export const audioMixSchema = z.object({
  trackId: z.string().min(1).max(64).nullable(),
  trackStartMs: z.number().int().min(0).default(0),
  musicDb: z
    .number()
    .int()
    .min(MUSIC_DB.min)
    .max(MUSIC_DB.max)
    .default(MUSIC_DB.default),
  sourceDb: z
    .number()
    .int()
    .min(SOURCE_DB.min)
    .max(SOURCE_DB.max)
    .default(SOURCE_DB.default),
  duck: z.boolean().default(true),
  fadeInMs: z.number().int().min(0).max(FADE_MAX_MS).default(0),
  fadeOutMs: z.number().int().min(0).max(FADE_MAX_MS).default(1500),
})
export type AudioMix = z.infer<typeof audioMixSchema>

export const DEFAULT_AUDIO_MIX: AudioMix = {
  trackId: null,
  trackStartMs: 0,
  musicDb: MUSIC_DB.default,
  sourceDb: SOURCE_DB.default,
  duck: true,
  fadeInMs: 0,
  fadeOutMs: 1500,
}

export const MUSIC_MAX_BYTES = 50 * 1024 * 1024
export const MUSIC_PEAK_BUCKETS = 240
export const TRACK_TITLE_MAX = 100

export const MUSIC_FORMATS = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
} as const
export type MusicFormat = keyof typeof MUSIC_FORMATS

export const MUSIC_ACCEPT = ".mp3,.m4a,.aac,.wav,.ogg,.flac,audio/*"

export type MusicTrackSummary = {
  id: string
  title: string
  durationMs: number
  peaks: number[]
  url: string
  usedBy: number
}
