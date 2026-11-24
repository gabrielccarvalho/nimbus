import { execFileSync } from "node:child_process"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { frameAt } from "@/features/effects/frame"
import type { LayoutInput } from "@/features/layout/schema"
import { confirmLayout } from "@/features/layout/service"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { jobQueue } from "@/features/jobs/queue"
import {
  cancelClipRenders,
  cancelEditRender,
  startClipRenders,
  startEditRender,
} from "@/features/render/service"
import { getEnv } from "@/lib/env"
import { getFfmpegCapabilities } from "@/lib/media/capabilities"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
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

function rawFrame(file: string, atS: number, pixFmt: "gray" | "rgb24") {
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
      pixFmt,
      "-",
    ],
    { maxBuffer: 16 * 1024 ** 2 }
  )
}

const grayFrame = (file: string, atS: number) => rawFrame(file, atS, "gray")

function columnColors(
  frame: Buffer,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  columns = 6
) {
  return Array.from({ length: columns }, (_, col) => {
    const fromX = rect.x + Math.round((rect.w * col) / columns)
    const toX = rect.x + Math.round((rect.w * (col + 1)) / columns)
    const sum = [0, 0, 0]
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = fromX; x < toX; x++) {
        for (let c = 0; c < 3; c++) sum[c]! += frame[(y * width + x) * 3 + c]!
      }
    }
    return sum.map((s) => s / ((toX - fromX) * rect.h))
  })
}

function colorDistance(a: number[][], b: number[][]) {
  return Math.max(
    ...a.flatMap((cell, i) => cell.map((c, j) => Math.abs(c - b[i]![j]!)))
  )
}

function bandDiff(a: Buffer, b: Buffer, fromY: number, toY: number) {
  let sum = 0
  for (let i = fromY * 1080; i < toY * 1080; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / ((toY - fromY) * 1080)
}

const camTop = {
  webcamRect: { x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "cam-top",
} satisfies LayoutInput

async function readyProject(captionsEnabled: boolean) {
  const { projectId } = await uploadFixture(fixtures.wide)
  const projects = projectRepository(env.db)
  await projects.updateSettings(projectId, {
    ...(await projects.getOrThrow(projectId)).settings,
    captionsEnabled,
  })
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  await confirmLayout(env.db, projectId, camTop)
  const [clip] = await clipRepository(env.db).listForProject(projectId)
  await setClipReviewStatus(env.db, projectId, clip!.id, "approved")
  return { projectId, clipId: clip!.id }
}

async function renderOne(captionsEnabled: boolean) {
  const { projectId, clipId } = await readyProject(captionsEnabled)
  await startClipRenders(env.db, projectId, [clipId])
  expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
    "rendering"
  )
  await runJobs(env.db, ["render_clip"])
  const clip = (await clipRepository(env.db).get(clipId))!
  expect(clip.error).toBeNull()
  expect(clip.status).toBe("rendered")
  expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
    "done"
  )
  const asset = (await assetRepository(env.db).get(clip.renderAssetId!))!
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
    const captionBand = bandDiff(a, b, 900, 1100)
    const webcamBand = bandDiff(a, b, 100, 600)
    expect(captionBand).toBeGreaterThan(4)
    expect(webcamBand).toBeLessThan(1.5)
  })

  it("marks the clip failed and returns to review when ffmpeg fails", async () => {
    const { projectId, clipId } = await readyProject(false)
    const project = await projectRepository(env.db).getOrThrow(projectId)
    const source = (await assetRepository(env.db).get(project.sourceAssetId!))!
    await getStorage().remove(source.storageKey)
    await startClipRenders(env.db, projectId, [clipId])
    await runJobs(env.db, ["render_clip"])
    expect(await clipRepository(env.db).get(clipId)).toMatchObject({
      status: "failed",
    })
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
  })

  it("refuses clips that aren't approved and unconfirmed layouts", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const [clip] = await clipRepository(env.db).listForProject(projectId)
    await expect(
      startClipRenders(env.db, projectId, [clip!.id])
    ).rejects.toThrow(/Confirm the layout|review/)
  })
})

describe("cancelling renders", () => {
  it("puts queued clips back to approved and returns to review", async () => {
    const { projectId, clipId } = await readyProject(false)
    await startClipRenders(env.db, projectId, [clipId])
    await cancelClipRenders(env.db, projectId)
    expect(await clipRepository(env.db).get(clipId)).toMatchObject({
      status: "approved",
    })
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
    expect(await jobQueue(env.db).countActive(projectId, ["render_clip"])).toBe(
      0
    )
    await expect(cancelClipRenders(env.db, projectId)).rejects.toThrow(
      /No clips/
    )
  })

  it("cancels the edit render and lets it start again", async () => {
    const { projectId } = await readyProject(false)
    await startEditRender(env.db, projectId)
    await cancelEditRender(env.db, projectId)
    expect(await jobQueue(env.db).countActive(projectId, ["render_edit"])).toBe(
      0
    )
    await expect(cancelEditRender(env.db, projectId)).rejects.toThrow(
      /isn't rendering/
    )
    await expect(startEditRender(env.db, projectId)).resolves.toBeDefined()
  })
})

describe("render_clip with effects", () => {
  const noCam = {
    webcamRect: null,
    gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
    gameplayFocusX: 0.5,
    mode: "no-cam-blur-fill",
  } satisfies LayoutInput
  const focusFromS = 3
  const insideS = 4.5

  async function renderWithFocus(
    focus: boolean,
    layoutOverride: LayoutInput | null = null
  ) {
    const { projectId, clipId } = await readyProject(false)
    const clips = clipRepository(env.db)
    const { startMs, endMs } = (await clips.get(clipId))!
    expect(endMs - startMs).toBeGreaterThan(7000)
    await clips.update(clipId, {
      layoutOverride,
      effects: focus
        ? {
            events: [
              {
                kind: "focus",
                startMs: startMs + focusFromS * 1000,
                endMs: startMs + (focusFromS + 3) * 1000,
              },
            ],
            edited: true,
          }
        : null,
    })
    await startClipRenders(env.db, projectId, [clipId])
    await runJobs(env.db, ["render_clip"])
    const clip = (await clips.get(clipId))!
    expect(clip.status).toBe("rendered")
    const asset = (await assetRepository(env.db).get(clip.renderAssetId!))!
    return { clip, file: getStorage().resolve(asset.storageKey) }
  }

  it("renders a focus range as webcam content", async () => {
    const plain = await renderWithFocus(false)
    const focused = await renderWithFocus(true)

    const { crop } = frameAt(
      camTop,
      { width: 1920, height: 1080 },
      [{ kind: "focus", startMs: 0, endMs: 1 }],
      0
    ).regions[0]!
    const band = { x: 0, y: 800, w: 1080, h: 300 }
    const webcam = columnColors(
      rawFrame(fixtures.wide, focused.clip.startMs / 1000 + insideS, "rgb24"),
      1920,
      {
        x: Math.round(crop.x),
        y: Math.round(crop.y + (crop.h * band.y) / 1920),
        w: Math.round(crop.w),
        h: Math.round((crop.h * band.h) / 1920),
      }
    )
    const at = (file: string) =>
      columnColors(rawFrame(file, insideS, "rgb24"), 1080, band)
    expect(colorDistance(at(focused.file), webcam)).toBeLessThan(15)
    expect(colorDistance(at(plain.file), webcam)).toBeGreaterThan(40)
    expect(
      bandDiff(
        grayFrame(plain.file, insideS),
        grayFrame(focused.file, insideS),
        800,
        1100
      )
    ).toBeGreaterThan(10)
    expect(
      bandDiff(grayFrame(plain.file, 1), grayFrame(focused.file, 1), 0, 1920)
    ).toBeLessThan(1.5)
  })

  it("ignores focus when the clip's layout has no webcam", async () => {
    const plain = await renderWithFocus(false, noCam)
    const focused = await renderWithFocus(true, noCam)
    expect(
      bandDiff(
        grayFrame(plain.file, insideS),
        grayFrame(focused.file, insideS),
        0,
        1920
      )
    ).toBeLessThan(1.5)
  })
})

describe("render_clip from 4:3", () => {
  it("fills the frame with a gameplay crop", async () => {
    const { projectId } = await uploadFixture(fixtures.standard)
    const projects = projectRepository(env.db)
    await projects.updateSettings(projectId, {
      ...(await projects.getOrThrow(projectId)).settings,
      captionsEnabled: false,
    })
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    await confirmLayout(env.db, projectId, {
      webcamRect: null,
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "no-cam-fill",
    })
    const [clip] = await clipRepository(env.db).listForProject(projectId)
    await setClipReviewStatus(env.db, projectId, clip!.id, "approved")
    await startClipRenders(env.db, projectId, [clip!.id])
    await runJobs(env.db, ["render_clip"])
    const rendered = (await clipRepository(env.db).get(clip!.id))!
    expect(rendered.error).toBeNull()
    const asset = (await assetRepository(env.db).get(rendered.renderAssetId!))!
    const video = probe(getStorage().resolve(asset.storageKey)).streams.find(
      (s) => s.codec_type === "video"
    )!
    expect([video.width, video.height]).toEqual([1080, 1920])
  })
})

describe("render_edit", () => {
  it.runIf(hasLibass)(
    "cuts long silences out of the horizontal edit",
    async () => {
      const { projectId } = await readyProject(true)
      await startEditRender(env.db, projectId)
      await expect(startEditRender(env.db, projectId)).rejects.toThrow(
        /already/
      )
      await runJobs(env.db, ["render_edit"])
      const edit = (await assetRepository(env.db).findByKind(
        projectId,
        "edit"
      ))!
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
