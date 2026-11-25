import { z } from "zod"

import { AppError } from "@/lib/errors"

import type { AudioTrack, SourceAspect } from "../../projects/schema"

const streamSchema = z.looseObject({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  channels: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  sample_aspect_ratio: z.string().optional(),
  duration: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z
    .array(z.looseObject({ rotation: z.number().optional() }))
    .optional(),
  disposition: z.record(z.string(), z.number()).optional(),
})

const probeSchema = z.object({
  streams: z.array(streamSchema).default([]),
  format: z
    .looseObject({
      duration: z.string().optional(),
      format_name: z.string().optional(),
    })
    .optional(),
})

export type ProbeResult = {
  durationMs: number
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  fps: number
  codec: string
  audioCodec: string
  audioTracks: AudioTrack[]
  formatName: string
}

export function parseRate(rate: string | undefined): number {
  if (!rate) return 0
  const [num, den] = rate.split("/").map(Number)
  if (!num || !Number.isFinite(num)) return 0
  if (den === undefined) return num
  return den ? num / den : 0
}

function parseSar(sar: string | undefined): number {
  if (!sar || sar === "0:1" || sar === "N/A") return 1
  const [a, b] = sar.split(":").map(Number)
  return a && b ? a / b : 1
}

function readProbe(json: string) {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (cause) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "Couldn't read this file's media info",
      {
        cause,
      }
    )
  }
  const parsed = probeSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "Couldn't read this file's media info"
    )
  }
  return parsed.data
}

export function parseProbe(json: string): ProbeResult {
  const { streams, format } = readProbe(json)
  const video = streams.find(
    (s) => s.codec_type === "video" && !s.disposition?.attached_pic
  )
  const audioStreams = streams.filter((s) => s.codec_type === "audio")
  const audio = audioStreams[0]
  if (!video || !video.width || !video.height) {
    throw new AppError("UNSUPPORTED_MEDIA", "This file has no video track")
  }
  if (!audio) {
    throw new AppError("UNSUPPORTED_MEDIA", "This file has no audio track")
  }
  const seconds = Number(format?.duration ?? video.duration ?? NaN)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "This file has no playable duration"
    )
  }

  const rotation =
    video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
    Number(video.tags?.rotate ?? 0)
  const rotated = Math.abs(rotation) % 180 === 90
  const sar = parseSar(video.sample_aspect_ratio)
  const width = video.width
  const height = video.height
  const displayWidth = Math.round(rotated ? height : width * sar)
  const displayHeight = rotated ? Math.round(width * sar) : height
  const fps = parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate)

  return {
    durationMs: Math.round(seconds * 1000),
    width,
    height,
    displayWidth,
    displayHeight,
    fps: Math.round(fps * 1000) / 1000,
    codec: video.codec_name ?? "unknown",
    audioCodec: audio.codec_name ?? "unknown",
    audioTracks: audioStreams.map((stream, index) => ({
      index,
      codec: stream.codec_name ?? "unknown",
      channels: stream.channels ?? 0,
      language: stream.tags?.language ?? null,
      title: stream.tags?.title ?? stream.tags?.handler_name ?? null,
    })),
    formatName: format?.format_name ?? "unknown",
  }
}

export function parseAudioProbe(json: string) {
  const { streams, format } = readProbe(json)
  const audio = streams.find((s) => s.codec_type === "audio")
  if (!audio) {
    throw new AppError("UNSUPPORTED_MEDIA", "This file has no audio track")
  }
  const seconds = Number(format?.duration ?? audio.duration ?? NaN)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AppError(
      "UNSUPPORTED_MEDIA",
      "This file has no playable duration"
    )
  }
  return {
    durationMs: Math.round(seconds * 1000),
    codec: audio.codec_name ?? "unknown",
  }
}

const TOLERANCE = 0.02

export function classifyAspect(width: number, height: number): SourceAspect {
  if (width <= 0 || height <= 0) return "other"
  const ratio = width / height
  const near = (target: number) =>
    Math.abs(ratio - target) / target <= TOLERANCE
  if (near(16 / 9)) return "16:9"
  if (near(16 / 10)) return "16:10"
  if (near(4 / 3)) return "4:3"
  if (ratio >= 2.33 * (1 - TOLERANCE) && ratio <= 2.4 * (1 + TOLERANCE)) {
    return "21:9"
  }
  return "other"
}

export function isLandscape(width: number, height: number) {
  return width >= height * 1.2
}
