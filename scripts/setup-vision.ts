import { createHash } from "node:crypto"
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const visionDir = path.join(root, "public/vendor/mediapipe")
const wasmSource = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm")
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
const MODEL_SHA256 =
  "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
export const modelFile = path.join(visionDir, "blaze_face_short_range.tflite")

async function exists(file: string) {
  return stat(file).then(
    (s) => s.size > 0,
    () => false
  )
}

export async function setupVision() {
  await mkdir(path.join(visionDir, "wasm"), { recursive: true })
  for (const file of await readdir(wasmSource)) {
    await copyFile(
      path.join(wasmSource, file),
      path.join(visionDir, "wasm", file)
    )
  }
  if (!(await exists(modelFile))) {
    const response = await fetch(MODEL_URL)
    if (!response.ok)
      throw new Error(`Model download failed: ${response.status}`)
    const model = new Uint8Array(await response.arrayBuffer())
    const sha256 = createHash("sha256").update(model).digest("hex")
    if (sha256 !== MODEL_SHA256) {
      throw new Error(`Model checksum mismatch: got ${sha256}`)
    }
    await writeFile(modelFile, model)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await setupVision()
  console.log(`MediaPipe assets ready in ${path.relative(root, visionDir)}`)
}
