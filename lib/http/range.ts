export type RangeResult =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" }

export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "full" }
  const match = /^bytes=(\d*)-(\d*)(?:,.*)?$/.exec(header.trim())
  if (!match) return { kind: "full" }
  const [, rawStart = "", rawEnd = ""] = match
  if (size === 0) return { kind: "unsatisfiable" }

  if (rawStart === "") {
    if (rawEnd === "") return { kind: "unsatisfiable" }
    const suffix = Number(rawEnd)
    if (suffix === 0) return { kind: "unsatisfiable" }
    return { kind: "partial", start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (start >= size || start > end) return { kind: "unsatisfiable" }
  return { kind: "partial", start, end }
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  wav: "audio/wav",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  ass: "text/x-ssa; charset=utf-8",
  json: "application/json",
  zip: "application/zip",
}

export function mimeForKey(key: string) {
  const ext = key.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[ext] ?? "application/octet-stream"
}
