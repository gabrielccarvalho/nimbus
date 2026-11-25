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

export function waveformPeaks(
  samples: Int16Array,
  buckets = MUSIC_PEAK_BUCKETS
) {
  const count = Math.min(buckets, samples.length)
  const peaks: number[] = []
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * samples.length) / count)
    const to = Math.floor(((i + 1) * samples.length) / count)
    let max = 0
    for (let j = from; j < to; j++)
      max = Math.max(max, Math.abs(samples[j] ?? 0))
    peaks.push(Math.round((max / 32768) * 1000) / 1000)
  }
  return peaks
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
