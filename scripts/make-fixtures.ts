import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const FIXTURES_VERSION = "2"

export const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/.generated"
)

export const fixtures = {
  wide: path.join(fixturesDir, "gameplay-16x9.mp4"),
  ultrawide: path.join(fixturesDir, "gameplay-21x9.mp4"),
  standard: path.join(fixturesDir, "gameplay-4x3.mp4"),
  notVideo: path.join(fixturesDir, "not-a-video.mp4"),
  noAudio: path.join(fixturesDir, "no-audio.mp4"),
  tone: path.join(fixturesDir, "tone-880hz.m4a"),
} as const

export const FIXTURE_DURATION_S = 20
export const FIXTURE_SILENCES_S: ReadonlyArray<readonly [number, number]> = [
  [4, 6],
  [12, 13.5],
]

const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg"

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args],
      {
        stdio: ["ignore", "ignore", "pipe"],
      }
    )
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
    )
  })
}

function gameplayArgs(options: {
  width: number
  height: number
  cam: { x: number; y: number; w: number; h: number }
  out: string
}) {
  const { width, height, cam, out } = options
  const silent = FIXTURE_SILENCES_S.map(
    ([a, b]) => `between(t,${a},${b})`
  ).join("+")
  const graph = [
    `[0:v]drawbox=x=0:y=0:w=${cam.w}:h=${cam.h}:color=white:t=6[camframe]`,
    `[1:v][camframe]overlay=0:0[camsrc]`,
    `[2:v][camsrc]overlay=${cam.x}:${cam.y},format=yuv420p[v]`,
    `[3:a]volume=enable='${silent}':volume=0[a]`,
  ].join(";")
  return [
    "-f",
    "lavfi",
    "-i",
    `color=c=black@0:s=${cam.w}x${cam.h}:d=${FIXTURE_DURATION_S},format=rgba`,
    "-f",
    "lavfi",
    "-i",
    `testsrc=s=${cam.w}x${cam.h}:d=${FIXTURE_DURATION_S}:r=30,hue=h=t*40`,
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=${width}x${height}:d=${FIXTURE_DURATION_S}:r=30`,
    "-f",
    "lavfi",
    "-i",
    `sine=f=440:d=${FIXTURE_DURATION_S}:sample_rate=48000`,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-g",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    out,
  ]
}

export async function makeFixtures({ force = false } = {}) {
  await mkdir(fixturesDir, { recursive: true })
  const stamp = path.join(fixturesDir, ".version")
  const current = existsSync(stamp)
    ? (await readFile(stamp, "utf8")).trim()
    : ""
  const fresh = force || current !== FIXTURES_VERSION
  const needed = (file: string) => fresh || !existsSync(file)

  if (needed(fixtures.wide)) {
    await run(
      gameplayArgs({
        width: 1920,
        height: 1080,
        cam: { x: 1920 - 384 - 32, y: 1080 - 216 - 32, w: 384, h: 216 },
        out: fixtures.wide,
      })
    )
  }
  if (needed(fixtures.ultrawide)) {
    await run(
      gameplayArgs({
        width: 2560,
        height: 1080,
        cam: { x: 32, y: 32, w: 384, h: 216 },
        out: fixtures.ultrawide,
      })
    )
  }
  if (needed(fixtures.standard)) {
    await run(
      gameplayArgs({
        width: 1440,
        height: 1080,
        cam: { x: 32, y: 1080 - 216 - 32, w: 384, h: 216 },
        out: fixtures.standard,
      })
    )
  }
  if (needed(fixtures.noAudio)) {
    await run([
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=640x360:d=3:r=30",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      fixtures.noAudio,
    ])
  }
  if (needed(fixtures.tone)) {
    await run([
      "-f",
      "lavfi",
      "-i",
      "sine=f=880:d=30:sample_rate=48000",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      fixtures.tone,
    ])
  }
  if (needed(fixtures.notVideo)) {
    await writeFile(fixtures.notVideo, randomBytes(64 * 1024))
  }
  await writeFile(stamp, FIXTURES_VERSION)
  return fixtures
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  makeFixtures({ force: process.argv.includes("--force") })
    .then((files) => console.log(Object.values(files).join("\n")))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
