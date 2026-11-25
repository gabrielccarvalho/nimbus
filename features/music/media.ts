import { MUSIC_PEAK_BUCKETS, TRACK_TITLE_MAX, type MusicFormat } from "./schema"

export const AUDIO_MAGIC_BYTES = 12

const ascii = (head: Uint8Array, offset: number, text: string) =>
  [...text].every((c, i) => head[offset + i] === c.charCodeAt(0))

export function sniffAudio(head: Uint8Array): MusicFormat | null {
  if (ascii(head, 0, "ID3")) return "mp3"
  if (head[0] === 0xff && head[1] !== undefined && (head[1] & 0xe0) === 0xe0) {
    return (head[1] & 0x06) === 0 ? "aac" : "mp3"
  }
  if (ascii(head, 4, "ftyp")) return "m4a"
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE")) return "wav"
  if (ascii(head, 0, "OggS")) return "ogg"
  if (ascii(head, 0, "fLaC")) return "flac"
  return null
}

export function peakFold(totalSamples: number, buckets = MUSIC_PEAK_BUCKETS) {
  const count = Math.min(buckets, Math.max(0, Math.floor(totalSamples)))
  const maxes = new Array<number>(count).fill(0)
  let index = 0
  let bucket = 0
  let end = count > 0 ? Math.floor(totalSamples / count) : 0
  let carry: number | null = null

  const sample = (value: number) => {
    if (count === 0) return
    while (bucket < count - 1 && index >= end) {
      bucket += 1
      end = Math.floor(((bucket + 1) * totalSamples) / count)
    }
    maxes[bucket] = Math.max(maxes[bucket]!, Math.abs(value))
    index += 1
  }
  const fromBytes = (lo: number, hi: number) => ((hi << 24) >> 16) | lo

  return {
    sample,
    push(chunk: Uint8Array) {
      let i = 0
      if (carry !== null && chunk.length > 0) {
        sample(fromBytes(carry, chunk[0]!))
        carry = null
        i = 1
      }
      for (; i + 1 < chunk.length; i += 2) {
        sample(fromBytes(chunk[i]!, chunk[i + 1]!))
      }
      if (i < chunk.length) carry = chunk[i]!
    },
    peaks() {
      return maxes.map((max) => Math.round((max / 32768) * 1000) / 1000)
    },
  }
}

export function waveformPeaks(
  samples: Int16Array,
  buckets = MUSIC_PEAK_BUCKETS
) {
  const fold = peakFold(samples.length, buckets)
  for (const value of samples) fold.sample(value)
  return fold.peaks()
}

export function trackTitleFromFile(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim()
  return (base || "Untitled track").slice(0, TRACK_TITLE_MAX)
}

export function trackInUseMessage(clips: readonly { title: string }[]) {
  const names = clips.map((clip) => `“${clip.title}”`)
  const shown =
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more ${names.length === 3 ? "clip" : "clips"}`
  return `This track is under ${shown}. Remove it from ${
    clips.length === 1 ? "that clip" : "those clips"
  } first.`
}
