import type { BorderCandidate } from "./border-heuristic"
import { FULL_FRAME, type LayoutInput, type Rect } from "./schema"

export const MIN_CONFIDENCE = 0.5

export type DetectionResult = LayoutInput & {
  confidence: number
  facesFound: number
}

const area = (r: Rect) => r.w * r.h

function intersection(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function clampRect(rect: Rect): Rect {
  const w = Math.min(1, Math.max(0.05, rect.w))
  const h = Math.min(1, Math.max(0.05, rect.h))
  return {
    x: Math.min(1 - w, Math.max(0, rect.x)),
    y: Math.min(1 - h, Math.max(0, rect.y)),
    w,
    h,
  }
}

export function webcamFromFace(face: Rect, frameAspect: number): Rect {
  const w = face.w * 3.2
  const h = (w * frameAspect) / (16 / 9)
  return clampRect({
    x: face.x + face.w / 2 - w / 2,
    y: face.y + face.h / 2 - h * 0.45,
    w,
    h,
  })
}

export function combineDetection({
  border,
  faces,
  frameCount,
  frameAspect,
}: {
  border: BorderCandidate | null
  faces: Rect[]
  frameCount: number
  frameAspect: number
}): DetectionResult {
  const base = {
    gameplayRect: FULL_FRAME,
    gameplayFocusX: 0.5,
    facesFound: faces.length,
  }
  const smallFaces = faces.filter((f) => area(f) < 0.15)
  const faceRatio = frameCount ? Math.min(1, smallFaces.length / frameCount) : 0
  const borderScore = border?.score ?? 0

  if (border && borderScore >= 0.6) {
    const inside = smallFaces.filter(
      (f) => intersection(f, border.rect) / area(f) > 0.6
    ).length
    const confidence =
      inside > 0 ? Math.max(0.9, borderScore) : borderScore * 0.8
    return {
      ...base,
      webcamRect: border.rect,
      mode: confidence >= MIN_CONFIDENCE ? "cam-top" : "no-cam-blur-fill",
      confidence: Math.round(confidence * 100) / 100,
    }
  }

  if (faceRatio >= 0.5) {
    const xs = smallFaces.map((f) => f.x).sort((a, b) => a - b)
    const ys = smallFaces.map((f) => f.y).sort((a, b) => a - b)
    const mid = Math.floor(smallFaces.length / 2)
    const median: Rect = {
      x: xs[mid]!,
      y: ys[mid]!,
      w: smallFaces.map((f) => f.w).sort((a, b) => a - b)[mid]!,
      h: smallFaces.map((f) => f.h).sort((a, b) => a - b)[mid]!,
    }
    const confidence = 0.5 + 0.2 * faceRatio
    return {
      ...base,
      webcamRect: webcamFromFace(median, frameAspect),
      mode: "cam-top",
      confidence: Math.round(confidence * 100) / 100,
    }
  }

  return {
    ...base,
    webcamRect: border?.rect ?? null,
    mode: "no-cam-blur-fill",
    confidence:
      Math.round(Math.max(borderScore * 0.8, faceRatio * 0.5) * 100) / 100,
  }
}
