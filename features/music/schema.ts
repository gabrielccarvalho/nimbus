import { z } from "zod"

export const MUSIC_DB = { min: -30, max: 0, default: -16 } as const
export const SOURCE_DB = { min: -30, max: 6, default: 0 } as const
export const FADE_MAX_MS = 5000

export const youtubeSoundSchema = z.object({
  videoId: z.string().regex(/^[\w-]{1,64}$/),
  title: z.string().min(1).max(200),
  channelTitle: z.string().max(200),
  thumbnailUrl: z.url().max(500).nullable(),
})
export type YoutubeSound = z.infer<typeof youtubeSoundSchema>

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
  youtubeSound: youtubeSoundSchema.nullable().optional(),
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

export const trackTitleSchema = z
  .string("Give the track a name")
  .trim()
  .min(1, "Give the track a name")
  .max(TRACK_TITLE_MAX, `Use at most ${TRACK_TITLE_MAX} characters`)

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

export type MusicTrackStatus = "processing" | "ready" | "failed"

type TrackBase = { id: string; title: string; url: string; usedBy: number }

export type ReadyMusicTrack = TrackBase & {
  status: "ready"
  durationMs: number
  peaks: number[]
  error: null
}

export type MusicTrackSummary =
  | ReadyMusicTrack
  | (TrackBase & {
      status: "processing" | "failed"
      durationMs: null
      peaks: null
      error: string | null
    })

export function toSummary(
  track: {
    id: string
    title: string
    status: MusicTrackStatus
    durationMs: number | null
    peaks: number[] | null
    error: string | null
  },
  usedBy: number
): MusicTrackSummary {
  const base = {
    id: track.id,
    title: track.title,
    url: `/api/music/${track.id}`,
    usedBy,
  }
  const { durationMs, peaks } = track
  if (track.status === "ready" && durationMs !== null && peaks !== null) {
    return { ...base, status: "ready", durationMs, peaks, error: null }
  }
  return {
    ...base,
    status: track.status === "failed" ? "failed" : "processing",
    durationMs: null,
    peaks: null,
    error: track.error,
  }
}

export const youtubeWatchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`

export type TrendingVideo = {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  durationMs: number | null
  views: number
}

export type TrendingMusic =
  | { status: "ok"; region: string; tracks: TrendingVideo[] }
  | { status: "no_channel" }
  | { status: "error"; message: string }
