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

export const MAX_MUSIC_LANES = 4
export const MIN_MUSIC_MS = 500

const decibels = (range: { min: number; max: number; default: number }) =>
  z.number().int().min(range.min).max(range.max).default(range.default)

export const musicClipSchema = z
  .object({
    trackId: z.string().min(1).max(64),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    inMs: z.number().int().nonnegative().default(0),
    db: decibels(MUSIC_DB),
    fadeInMs: z.number().int().min(0).max(FADE_MAX_MS).default(0),
    fadeOutMs: z.number().int().min(0).max(FADE_MAX_MS).default(1500),
    lane: z
      .number()
      .int()
      .min(0)
      .max(MAX_MUSIC_LANES - 1)
      .default(0),
  })
  .refine((clip) => clip.endMs - clip.startMs >= MIN_MUSIC_MS, {
    message: "Keep the music for at least half a second",
    path: ["endMs"],
  })
export type MusicClip = z.infer<typeof musicClipSchema>

export const audioMixSchema = z.object({
  sourceDb: decibels(SOURCE_DB),
  sourceMuted: z.boolean().default(false),
  duck: z.boolean().default(true),
  music: z.array(musicClipSchema).max(8).default([]),
  youtubeSound: youtubeSoundSchema.nullable().optional(),
})
export type AudioMix = z.infer<typeof audioMixSchema>

export const DEFAULT_AUDIO_MIX: AudioMix = {
  sourceDb: SOURCE_DB.default,
  sourceMuted: false,
  duck: true,
  music: [],
}

export function newMusicClip(
  trackId: string,
  placed: { startMs: number; endMs: number; lane: number }
): MusicClip {
  return {
    trackId,
    ...placed,
    inMs: 0,
    db: MUSIC_DB.default,
    fadeInMs: 0,
    fadeOutMs: 1500,
  }
}

export function musicInClip<M extends AudioMix | null>(
  mix: M,
  durationMs: number
): M {
  if (!mix) return mix
  return {
    ...mix,
    music: mix.music.flatMap((clip) => {
      const endMs = Math.min(clip.endMs, durationMs)
      return endMs - clip.startMs >= MIN_MUSIC_MS ? [{ ...clip, endMs }] : []
    }),
  }
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
