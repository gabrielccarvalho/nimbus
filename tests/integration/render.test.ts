import { execFileSync } from "node:child_process"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { confirmLayout } from "@/features/layout/service"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { startClipRenders, startEditRender } from "@/features/render/service"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

const hasLibass = (await getFfmpegCapabilities(getEnv().FFMPEG_PATH)).hasLibass

function probe(file: string) {
  const out = execFileSync(getEnv().FFPROBE_PATH, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    file,
  ])
  return JSON.parse(out.toString()) as {
    streams: { codec_type: string; width?: number; height?: number }[]
    format: { duration: string }
  }
}

function grayFrame(file: string, atS: number) {
  return execFileSync(
    getEnv().FFMPEG_PATH,
    [
      "-v",
      "error",
      "-ss",
      String(atS),
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 16 * 1024 ** 2 }
  )
}

function bandDiff(a: Buffer, b: Buffer, fromY: number, toY: number) {
  let sum = 0
  for (let i = fromY * 1080; i < toY * 1080; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / ((toY - fromY) * 1080)
}

async function readyProject(captionsEnabled: boolean) {
  const { projectId } = await uploadFixture(fixtures.wide)
  const projects = projectRepository(env.db)
  projects.updateSettings(projectId, {
    ...projects.getOrThrow(projectId).settings,
    captionsEnabled,
  })
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  confirmLayout(env.db, projectId, {
    webcamRect: { x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 },
    gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
    gameplayFocusX: 0.5,
    mode: "cam-top",
  })
  const [clip] = clipRepository(env.db).listForProject(projectId)
  setClipReviewStatus(env.db, projectId, clip!.id, "approved")
  return { projectId, clipId: clip!.id }
}

async function renderOne(captionsEnabled: boolean) {
  const { projectId, clipId } = await readyProject(captionsEnabled)
  startClipRenders(env.db, projectId, [clipId])
  expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
    "rendering"
  )
  await runJobs(env.db, ["render_clip"])
  const clip = clipRepository(env.db).get(clipId)!
  expect(clip.error).toBeNull()
  expect(clip.status).toBe("rendered")
  expect(projectRepository(env.db).getOrThrow(projectId).status).toBe("done")
  const asset = assetRepository(env.db).get(clip.renderAssetId!)!
  return { clip, file: getStorage().resolve(asset.storageKey), projectId }
}

describe("render_clip", () => {
  it("renders a 1080×1920 clip with audio at the clip's length", async () => {
    const { clip, file } = await renderOne(false)
    const info = probe(file)
    const video = info.streams.find((s) => s.codec_type === "video")!
    expect([video.width, video.height]).toEqual([1080, 1920])
    expect(info.streams.some((s) => s.codec_type === "audio")).toBe(true)
    expect(Number(info.format.duration)).toBeCloseTo(
      (clip.endMs - clip.startMs) / 1000,
      0
    )
  })

  it.runIf(hasLibass)("burns captions in below the webcam band", async () => {
    const plain = await renderOne(false)
    const captioned = await renderOne(true)
    expect(captioned.clip.startMs).toBe(plain.clip.startMs)
    const at = 1
    const a = grayFrame(plain.file, at)
    const b = grayFrame(captioned.file, at)
    const captionBand = bandDiff(a, b, 1150, 1400)
    const webcamBand = bandDiff(a, b, 100, 600)
    expect(captionBand).toBeGreaterThan(4)
    expect(webcamBand).toBeLessThan(1.5)
  })

  it("marks the clip failed and returns to review when ffmpeg fails", async () => {
    const { projectId, clipId } = await readyProject(false)
    const project = projectRepository(env.db).getOrThrow(projectId)
    const source = assetRepository(env.db).get(project.sourceAssetId!)!
    await getStorage().remove(source.storageKey)
    startClipRenders(env.db, projectId, [clipId])
    await runJobs(env.db, ["render_clip"])
    expect(clipRepository(env.db).get(clipId)).toMatchObject({
      status: "failed",
    })
    expect(projectRepository(env.db).getOrThrow(projectId).status).toBe(
      "ready_for_review"
    )
  })

  it("refuses clips that aren't approved and unconfirmed layouts", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const [clip] = clipRepository(env.db).listForProject(projectId)
    expect(() => startClipRenders(env.db, projectId, [clip!.id])).toThrow(
      /Confirm the layout|review/
    )
  })
})

describe("render_edit", () => {
  it.runIf(hasLibass)(
    "cuts long silences out of the horizontal edit",
    async () => {
      const { projectId } = await readyProject(true)
      startEditRender(env.db, projectId)
      expect(() => startEditRender(env.db, projectId)).toThrow(/already/)
      await runJobs(env.db, ["render_edit"])
      const edit = assetRepository(env.db).findByKind(projectId, "edit")!
      const info = probe(getStorage().resolve(edit.storageKey))
      const video = info.streams.find((s) => s.codec_type === "video")!
      expect([video.width, video.height]).toEqual([1920, 1080])
      expect(Number(info.format.duration)).toBeLessThan(19)
      expect(Number(info.format.duration)).toBeCloseTo(
        edit.durationMs! / 1000,
        0
      )
    }
  )
})
