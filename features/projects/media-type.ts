export const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/webm": "webm",
} as const

export type AcceptedVideoMime = keyof typeof ACCEPTED_VIDEO_TYPES
export type VideoContainer = "isobmff" | "matroska"

export const MAGIC_BYTES_NEEDED = 12

const ISO_BOXES = new Set(["ftyp", "moov", "mdat", "free", "wide", "skip"])

export function sniffContainer(head: Uint8Array): VideoContainer | null {
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    return "matroska"
  }
  if (head.length >= 8) {
    const box = String.fromCharCode(...head.slice(4, 8))
    if (ISO_BOXES.has(box)) return "isobmff"
  }
  return null
}

export function containerMatchesMime(
  container: VideoContainer,
  mime: AcceptedVideoMime
) {
  if (container === "matroska") {
    return mime === "video/x-matroska" || mime === "video/webm"
  }
  return mime === "video/mp4" || mime === "video/quicktime"
}

export function isAcceptedMime(mime: string): mime is AcceptedVideoMime {
  return mime in ACCEPTED_VIDEO_TYPES
}

export function mimeFromFileName(name: string): AcceptedVideoMime | null {
  const ext = name.split(".").pop()?.toLowerCase()
  const entry = Object.entries(ACCEPTED_VIDEO_TYPES).find(([, e]) => e === ext)
  if (ext === "m4v") return "video/mp4"
  return entry ? (entry[0] as AcceptedVideoMime) : null
}

export function projectNameFromFile(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim()
  return (base || "Untitled project").slice(0, 120)
}
