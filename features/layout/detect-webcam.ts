import { detectOverlayRect, type GrayFrame } from "./border-heuristic"
import { combineDetection, type DetectionResult } from "./detection"
import type { Rect } from "./schema"

const SAMPLE_WIDTH = 320
const VISION_BASE = "/vendor/mediapipe"

type FaceFinder = (canvas: HTMLCanvasElement) => Rect[]

// The MediaPipe wasm build hardwires stderr to console.error, so TFLite's
// "INFO: Created ... delegate" log surfaces as an error in the dev overlay.
function withoutWasmInfoLogs<T>(run: () => T): T {
  const error = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return
    error(...args)
  }
  try {
    return run()
  } finally {
    console.error = error
  }
}

async function loadFaceFinder(): Promise<FaceFinder | null> {
  try {
    const { FaceDetector, FilesetResolver } =
      await import("@mediapipe/tasks-vision")
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`)
    const detector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${VISION_BASE}/blaze_face_short_range.tflite`,
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    })
    return (canvas) =>
      withoutWasmInfoLogs(() => detector.detect(canvas)).detections.flatMap(
        ({ boundingBox: box }) =>
          box
            ? [
                {
                  x: box.originX / canvas.width,
                  y: box.originY / canvas.height,
                  w: box.width / canvas.width,
                  h: box.height / canvas.height,
                },
              ]
            : []
      )
  } catch (error) {
    console.warn("Face detection unavailable", error)
    return null
  }
}

function once(target: EventTarget, type: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal!.reason)
    target.addEventListener(
      type,
      () => {
        signal?.removeEventListener("abort", onAbort)
        resolve()
      },
      { once: true }
    )
    target.addEventListener(
      "error",
      () => reject(new Error("Could not read the video")),
      {
        once: true,
      }
    )
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function toGray(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): GrayFrame {
  const { data } = context.getImageData(0, 0, width, height)
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0; i < gray.length; i++) {
    gray[i] =
      (data[i * 4]! * 299 + data[i * 4 + 1]! * 587 + data[i * 4 + 2]! * 114) /
      1000
  }
  return { data: gray, width, height }
}

function cropCanvas(source: HTMLCanvasElement, rect: Rect) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(rect.w * source.width))
  canvas.height = Math.max(1, Math.round(rect.h * source.height))
  canvas
    .getContext("2d")!
    .drawImage(
      source,
      rect.x * source.width,
      rect.y * source.height,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    )
  return canvas
}

export type WebcamDetection = DetectionResult & { faceDetection: boolean }

export async function detectWebcam(
  src: string,
  { frames = 8, signal }: { frames?: number; signal?: AbortSignal } = {}
): Promise<WebcamDetection> {
  const video = document.createElement("video")
  video.muted = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  video.src = src
  const findFaces = loadFaceFinder()
  try {
    await once(video, "loadeddata", signal)
    const width = video.videoWidth
    const height = video.videoHeight
    const sampleHeight = Math.round((SAMPLE_WIDTH * height) / width)
    const full = document.createElement("canvas")
    full.width = width
    full.height = height
    const fullContext = full.getContext("2d", { willReadFrequently: true })!
    const small = document.createElement("canvas")
    small.width = SAMPLE_WIDTH
    small.height = sampleHeight
    const smallContext = small.getContext("2d", { willReadFrequently: true })!

    const gray: GrayFrame[] = []
    const snapshots: HTMLCanvasElement[] = []
    for (let i = 0; i < frames; i++) {
      video.currentTime = (video.duration * (i + 0.5)) / frames
      await once(video, "seeked", signal)
      fullContext.drawImage(video, 0, 0, width, height)
      smallContext.drawImage(video, 0, 0, SAMPLE_WIDTH, sampleHeight)
      gray.push(toGray(smallContext, SAMPLE_WIDTH, sampleHeight))
      const snapshot = document.createElement("canvas")
      snapshot.width = width
      snapshot.height = height
      snapshot.getContext("2d")!.drawImage(full, 0, 0)
      snapshots.push(snapshot)
    }

    const border = detectOverlayRect(gray)
    const finder = await findFaces
    const faces: Rect[] = []
    if (finder) {
      for (const snapshot of snapshots) {
        const region = border?.rect
        const inRegion = region
          ? finder(cropCanvas(snapshot, region)).map((face) => ({
              x: region.x + face.x * region.w,
              y: region.y + face.y * region.h,
              w: face.w * region.w,
              h: face.h * region.h,
            }))
          : []
        faces.push(...(inRegion.length ? inRegion : finder(snapshot)))
      }
    }
    return {
      ...combineDetection({
        border,
        faces,
        frameCount: frames,
        frameAspect: width / height,
      }),
      faceDetection: finder !== null,
    }
  } finally {
    video.removeAttribute("src")
    video.load()
  }
}
