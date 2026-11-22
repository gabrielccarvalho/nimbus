import "server-only"

import { runProcess } from "@/lib/process/run"

export type FfmpegCapabilities = {
  available: boolean
  version: string | null
  filters: ReadonlySet<string>
  encoders: ReadonlySet<string>
  hasLibass: boolean
  hasLibx264: boolean
  hardwareEncoders: string[]
}

const HARDWARE_ENCODERS = [
  "h264_videotoolbox",
  "h264_nvenc",
  "h264_qsv",
  "h264_vaapi",
]

export function parseFilterList(output: string): Set<string> {
  const names = new Set<string>()
  for (const line of output.split("\n")) {
    const match = /^\s*[.TSC|]{2,3}\s+(\S+)\s+\S+->\S+/.exec(line)
    if (match?.[1]) names.add(match[1])
  }
  return names
}

export function parseEncoderList(output: string): Set<string> {
  const names = new Set<string>()
  for (const line of output.split("\n")) {
    const match = /^\s*[VAS][.F][.S][.X][.B][.D]\s+(\S+)/.exec(line)
    if (match?.[1]) names.add(match[1])
  }
  return names
}

const cache = new Map<string, Promise<FfmpegCapabilities>>()

export function getFfmpegCapabilities(
  ffmpegPath: string
): Promise<FfmpegCapabilities> {
  let pending = cache.get(ffmpegPath)
  if (!pending) {
    pending = detect(ffmpegPath)
    cache.set(ffmpegPath, pending)
  }
  return pending
}

async function detect(ffmpegPath: string): Promise<FfmpegCapabilities> {
  try {
    const [version, filters, encoders] = await Promise.all([
      runProcess(ffmpegPath, ["-hide_banner", "-version"], {
        timeoutMs: 10_000,
      }),
      runProcess(ffmpegPath, ["-hide_banner", "-filters"], {
        timeoutMs: 10_000,
      }),
      runProcess(ffmpegPath, ["-hide_banner", "-encoders"], {
        timeoutMs: 10_000,
      }),
    ])
    const filterSet = parseFilterList(filters.stdout)
    const encoderSet = parseEncoderList(encoders.stdout)
    return {
      available: version.code === 0,
      version: /ffmpeg version (\S+)/.exec(version.stdout)?.[1] ?? null,
      filters: filterSet,
      encoders: encoderSet,
      hasLibass: filterSet.has("ass"),
      hasLibx264: encoderSet.has("libx264"),
      hardwareEncoders: HARDWARE_ENCODERS.filter((name) =>
        encoderSet.has(name)
      ),
    }
  } catch {
    return {
      available: false,
      version: null,
      filters: new Set(),
      encoders: new Set(),
      hasLibass: false,
      hasLibx264: false,
      hardwareEncoders: [],
    }
  }
}
