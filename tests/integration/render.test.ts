import { execFileSync, spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import type { TimeRange } from "@/features/analysis/schema"
import { wordsInRange } from "@/features/captions/pages"
import { speakerTranscriptWords } from "@/features/captions/speaker"
import type { TextOverlay } from "@/features/captions/overlay"
import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { frameAt, type FrameRegion } from "@/features/effects/frame"
import type { Effect } from "@/features/effects/schema"
import { coverCrop, toPixels } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { jobQueue } from "@/features/jobs/queue"
import type { JobHandler } from "@/features/jobs/worker-loop"
import { speechIntervals } from "@/features/music/envelope"
import { musicRepository } from "@/features/music/repository"
import {
  DEFAULT_AUDIO_MIX,
  newMusicClip,
  type AudioMix,
  type MusicClip,
} from "@/features/music/schema"
import { renderClipStep } from "@/features/pipeline/steps/render-clip"
import {
  cancelClipRenders,
  cancelEditRender,
  startClipRenders,
  startEditRender,
} from "@/features/render/service"
import { transcriptRepository } from "@/features/transcription/repository"
import { jobs, musicTracks, projects, user } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import * as capabilities from "@/lib/media/capabilities"
import { getStorage, storageKeys } from "@/lib/storage"

import { FIXTURE_SILENCES_S, fixtures } from "../../scripts/make-fixtures"
import { runJobs, setClipLayouts, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const hasLibass = (
  await capabilities.getFfmpegCapabilities(getEnv().FFMPEG_PATH)
).hasLibass

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

function nthFrame(file: string, n: number) {
  return execFileSync(
    getEnv().FFMPEG_PATH,
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `select=eq(n\\,${n})`,
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

function regionDiff(rendered: Buffer, source: Buffer, region: FrameRegion) {
  const { crop, dest } = region
  const at = (x: number, y: number) => source[y * 1920 + x]!
  let sum = 0
  let count = 0
  for (let v = 8; v < dest.h - 8; v += 4) {
    for (let u = 8; u < dest.w - 8; u += 4) {
      const sx = Math.min(1918, crop.x + ((u + 0.5) * crop.w) / dest.w - 0.5)
      const sy = Math.min(1078, crop.y + ((v + 0.5) * crop.h) / dest.h - 0.5)
      const x = Math.floor(sx)
      const y = Math.floor(sy)
      const fx = sx - x
      const fy = sy - y
      const expected =
        (at(x, y) * (1 - fx) + at(x + 1, y) * fx) * (1 - fy) +
        (at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx) * fy
      sum += Math.abs(expected - rendered[(dest.y + v) * 1080 + dest.x + u]!)
      count++
    }
  }
  return sum / count
}

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
  await setClipLayouts(env.db, projectId, camTop)
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
  return { clip, file: path.join(env.dataDir, asset.storageKey), projectId }
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

  it("refuses clips that aren't approved", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
    const [clip] = await clipRepository(env.db).listForProject(projectId)
    await expect(
      startClipRenders(env.db, projectId, [clip!.id])
    ).rejects.toThrow(/Approve clips/)
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

  const focusFrom =
    (target: "cam" | "game" = "cam") =>
    (startMs: number): Effect[] => [
      {
        kind: "focus",
        startMs: startMs + focusFromS * 1000,
        endMs: startMs + (focusFromS + 3) * 1000,
        target,
      },
    ]

  async function renderWith(
    events: ((startMs: number) => Effect[]) | null,
    layout: LayoutInput = camTop
  ) {
    const { projectId, clipId } = await readyProject(false)
    const clips = clipRepository(env.db)
    const { startMs, endMs } = (await clips.get(clipId))!
    expect(endMs - startMs).toBeGreaterThan(7000)
    await clips.update(clipId, {
      layout,
      effects: events ? { events: events(startMs), edited: true } : null,
    })
    await startClipRenders(env.db, projectId, [clipId])
    await runJobs(env.db, ["render_clip"])
    const clip = (await clips.get(clipId))!
    expect(clip.status).toBe("rendered")
    const asset = (await assetRepository(env.db).get(clip.renderAssetId!))!
    return { clip, file: path.join(env.dataDir, asset.storageKey) }
  }

  it("renders a focus range as webcam content", async () => {
    const plain = await renderWith(null)
    const focused = await renderWith(focusFrom())

    const { crop } = frameAt(
      camTop,
      { width: 1920, height: 1080 },
      [{ kind: "focus", startMs: 0, endMs: 1, target: "cam" }],
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

  it("renders a full game range as gameplay only", async () => {
    const plain = await renderWith(null)
    const full = await renderWith(focusFrom("game"))

    const crop = coverCrop(
      toPixels(camTop.gameplayRect, 1920, 1080),
      1080 / 1920,
      camTop.gameplayFocusX
    )
    const band = { x: 0, y: 100, w: 1080, h: 400 }
    const gameplay = columnColors(
      rawFrame(fixtures.wide, full.clip.startMs / 1000 + insideS, "rgb24"),
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
    expect(colorDistance(at(full.file), gameplay)).toBeLessThan(15)
    expect(colorDistance(at(plain.file), gameplay)).toBeGreaterThan(40)
    expect(
      bandDiff(grayFrame(plain.file, 1), grayFrame(full.file, 1), 0, 1920)
    ).toBeLessThan(1.5)
  })

  it("puts zoom and shake crops on the frames frameAt gives them", async () => {
    const { clip, file } = await renderWith((startMs) => [
      {
        kind: "zoom",
        startMs: startMs + 2000,
        endMs: startMs + 5000,
        scale: 1.6,
        focus: { x: 0.3, y: 0.4 },
      },
      {
        kind: "shake",
        startMs: startMs + 3000,
        endMs: startMs + 3600,
        intensity: "strong",
      },
    ])
    const n = 100
    const tMs = (frame: number) => clip.startMs + (frame * 1000) / 30
    const gameplayAt = (frame: number, events = clip.effects!.events) =>
      frameAt(camTop, { width: 1920, height: 1080 }, events, tMs(frame))
        .regions[1]!
    const rendered = nthFrame(file, n)
    const source = grayFrame(fixtures.wide, tMs(n) / 1000)
    const diff = (region: FrameRegion) => regionDiff(rendered, source, region)
    expect(diff(gameplayAt(n))).toBeLessThan(2)
    expect(diff(gameplayAt(n - 1))).toBeGreaterThan(4)
    expect(diff(gameplayAt(n + 1))).toBeGreaterThan(4)
    expect(diff(gameplayAt(n, []))).toBeGreaterThan(20)
  })

  it("ignores focus when the clip's layout has no webcam", async () => {
    const plain = await renderWith(null, noCam)
    const focused = await renderWith(focusFrom(), noCam)
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
    await setClipLayouts(env.db, projectId, {
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
    const video = probe(path.join(env.dataDir, asset.storageKey)).streams.find(
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
      const info = probe(path.join(env.dataDir, edit.storageKey))
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

function bandLevelDb(
  file: string,
  hz: number,
  fromS: number,
  durationS: number
): number {
  const { stderr } = spawnSync(
    getEnv().FFMPEG_PATH,
    [
      "-hide_banner",
      "-nostats",
      "-ss",
      String(fromS),
      "-t",
      String(durationS),
      "-i",
      file,
      "-af",
      `bandpass=f=${hz}:width_type=h:w=100,volumedetect`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" }
  )
  const level = /mean_volume: (\S+) dB/.exec(stderr)?.[1]
  if (!level) throw new Error(`volumedetect printed no level:\n${stderr}`)
  return level === "-inf" ? -Infinity : Number(level)
}

describe("render_clip with music and on-screen text", () => {
  const WINDOW_MS = 600
  const MARGIN_MS = 250

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function workspaceWithTrack() {
    const id = crypto.randomUUID()
    const owner = { id, name: "Owner", email: `${id}@example.com` }
    await env.db.insert(user).values(owner)
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      owner
    )
    const trackId = crypto.randomUUID()
    const storageKey = storageKeys.music(workspace.id, trackId, "m4a")
    await getStorage().writeBuffer(storageKey, await readFile(fixtures.tone))
    const track = await musicRepository(env.db).create({
      id: trackId,
      workspaceId: workspace.id,
      title: "Tone",
      storageKey,
      mime: "audio/mp4",
      durationMs: Math.round(
        Number(probe(fixtures.tone).format.duration) * 1000
      ),
      peaks: [],
    })
    return { workspaceId: workspace.id, track }
  }

  async function musicProject() {
    const { projectId, clipId } = await readyProject(false)
    const { workspaceId, track } = await workspaceWithTrack()
    await env.db
      .update(projects)
      .set({ workspaceId })
      .where(eq(projects.id, projectId))
    const clip = (await clipRepository(env.db).get(clipId))!
    return { projectId, clip, track }
  }

  const failFast = () =>
    env.db
      .update(jobs)
      .set({ maxAttempts: 1 })
      .where(eq(jobs.type, "render_clip"))
  const trackGone =
    "A music track on this clip was deleted. Pick another track or remove that music."

  async function renderClip(
    projectId: string,
    clipId: string,
    patch: { audioMix?: AudioMix | null; textOverlays?: TextOverlay[] },
    beforeRun?: () => Promise<unknown>
  ) {
    const clips = clipRepository(env.db)
    await clips.update(clipId, {
      audioMix: null,
      textOverlays: [],
      ...patch,
    })
    await startClipRenders(env.db, projectId, [clipId])
    await beforeRun?.()
    let thrown: unknown
    const capture: JobHandler = (context) =>
      renderClipStep(context).catch((error: unknown) => {
        thrown = error
        throw error
      })
    await runJobs(env.db, ["render_clip"], { render_clip: capture })
    const clip = (await clips.get(clipId))!
    if (clip.status !== "rendered") return { clip, thrown, file: "" }
    const asset = (await assetRepository(env.db).get(clip.renderAssetId!))!
    return { clip, thrown, file: path.join(env.dataDir, asset.storageKey) }
  }

  function sourceSilence(clip: { startMs: number; endMs: number }) {
    for (const [a, b] of FIXTURE_SILENCES_S) {
      const fromMs = Math.max(a * 1000, clip.startMs) - clip.startMs + 300
      const toMs = Math.min(b * 1000, clip.endMs) - clip.startMs - 300
      if (toMs - fromMs >= 500) {
        return { fromS: fromMs / 1000, durationS: (toMs - fromMs) / 1000 }
      }
    }
    throw new Error("The clip has no source silence to measure the music in")
  }

  function duckWindows(intervals: readonly TimeRange[], durationMs: number) {
    const speech = intervals.find(
      (i) => i.endMs - i.startMs >= WINDOW_MS + 2 * MARGIN_MS
    )
    const bounds = [
      -MARGIN_MS,
      ...intervals.flatMap((i) => [i.startMs, i.endMs]),
      durationMs + MARGIN_MS,
    ]
    let quiet: number | undefined
    for (let k = 0; k < bounds.length && quiet === undefined; k += 2) {
      const fromMs = bounds[k]! + MARGIN_MS
      if (bounds[k + 1]! - MARGIN_MS - fromMs >= WINDOW_MS) quiet = fromMs
    }
    return { speech: speech && speech.startMs + MARGIN_MS, quiet }
  }

  const music = (
    trackId: string,
    patch: Partial<MusicClip> = {},
    mix: Partial<AudioMix> = {}
  ): AudioMix => ({
    ...DEFAULT_AUDIO_MIX,
    ...mix,
    music: [
      {
        ...newMusicClip(trackId, { startMs: 0, endMs: 180_000, lane: 0 }),
        ...patch,
      },
    ],
  })
  const loud = { db: 0, fadeOutMs: 0 }
  const title = [
    {
      text: "WAIT FOR IT",
      position: "top" as const,
      startMs: 0,
      endMs: 3000,
      lane: 0,
    },
  ]

  it("mixes the track under the clip", async () => {
    const { projectId, clip, track } = await musicProject()
    const durationS = (clip.endMs - clip.startMs) / 1000
    const silence = sourceSilence(clip)

    const mixed = await renderClip(projectId, clip.id, {
      audioMix: music(track.id, loud, { duck: false }),
    })
    expect(mixed.clip.error).toBeNull()
    const info = probe(mixed.file)
    const video = info.streams.find((s) => s.codec_type === "video")!
    expect([video.width, video.height]).toEqual([1080, 1920])
    expect(Math.abs(Number(info.format.duration) - durationS)).toBeLessThan(0.1)
    expect(
      bandLevelDb(mixed.file, 880, silence.fromS, silence.durationS)
    ).toBeGreaterThan(-35)

    const plain = await renderClip(projectId, clip.id, { audioMix: null })
    expect(
      bandLevelDb(plain.file, 880, silence.fromS, silence.durationS)
    ).toBeLessThan(-50)
  })

  it("ducks the music under speech in clip time", async () => {
    const selected = await musicProject()
    const { projectId, track } = selected
    const clip = await clipRepository(env.db).update(selected.clip.id, {
      startMs: selected.clip.startMs + 3000,
    })
    expect(clip.startMs).toBeGreaterThan(WINDOW_MS + 2 * MARGIN_MS)
    const durationMs = clip.endMs - clip.startMs
    const intervals = speechIntervals(
      wordsInRange(
        speakerTranscriptWords(
          await transcriptRepository(env.db).get(projectId)
        ),
        clip.startMs,
        clip.endMs
      ),
      durationMs
    )
    const { speech, quiet } = duckWindows(intervals, durationMs)
    expect(speech).toBeDefined()
    expect(quiet).toBeDefined()

    const { file } = await renderClip(projectId, clip.id, {
      audioMix: music(track.id, loud, { duck: true, sourceDb: -10 }),
    })
    const level = (atMs: number) =>
      bandLevelDb(file, 880, atMs / 1000, WINDOW_MS / 1000)
    const drop = level(quiet!) - level(speech!)
    expect(drop).toBeGreaterThan(8)
    expect(drop).toBeLessThan(12)
  })

  it("lets the music end early when the track runs out", async () => {
    const { projectId, clip, track } = await musicProject()
    const durationS = (clip.endMs - clip.startMs) / 1000
    expect(durationS).toBeGreaterThan(7)

    const { file } = await renderClip(projectId, clip.id, {
      audioMix: music(
        track.id,
        { inMs: (track.durationMs ?? 0) - 5000, db: 0 },
        { sourceDb: -10 }
      ),
    })
    expect(
      Math.abs(Number(probe(file).format.duration) - durationS)
    ).toBeLessThan(0.1)
    expect(bandLevelDb(file, 880, durationS - 1, 1)).toBeLessThan(-50)
    expect(bandLevelDb(file, 440, durationS - 1, 1)).toBeGreaterThan(-40)
  })

  it.skipIf(!hasLibass)(
    "burns the on-screen text in with captions off",
    async () => {
      const { projectId, clip } = await musicProject()
      const plain = await renderClip(projectId, clip.id, {})
      const plainFrames = [grayFrame(plain.file, 1), grayFrame(plain.file, 5)]
      const titled = await renderClip(projectId, clip.id, {
        textOverlays: title,
      })
      expect(titled.clip.error).toBeNull()
      expect(
        bandDiff(plainFrames[0]!, grayFrame(titled.file, 1), 240, 420)
      ).toBeGreaterThan(10)
      expect(
        bandDiff(plainFrames[1]!, grayFrame(titled.file, 5), 240, 420)
      ).toBeLessThan(1)
    }
  )

  it("fails without libass when the clip has on-screen text", async () => {
    const { projectId, clip } = await musicProject()
    const real = await capabilities.getFfmpegCapabilities(getEnv().FFMPEG_PATH)
    vi.spyOn(capabilities, "getFfmpegCapabilities").mockResolvedValue({
      ...real,
      hasLibass: false,
    })
    const message =
      "This ffmpeg can't burn in on-screen text (no libass). Install one with libass or remove the text."
    const { clip: failed, thrown } = await renderClip(projectId, clip.id, {
      textOverlays: title,
    })
    expect(thrown).toMatchObject({ code: "DEPENDENCY_MISSING", message })
    expect(failed).toMatchObject({ status: "failed", error: message })
  })

  it("fails when the clip's music track was deleted", async () => {
    const { projectId, clip, track } = await musicProject()
    const { clip: failed, thrown } = await renderClip(
      projectId,
      clip.id,
      { audioMix: music(track.id) },
      async () => {
        await env.db.delete(musicTracks).where(eq(musicTracks.id, track.id))
        await failFast()
      }
    )
    expect(thrown).toMatchObject({ code: "CONFLICT", message: trackGone })
    expect(failed).toMatchObject({ status: "failed", error: trackGone })
  })

  it("fails when the clip's music track isn't ready", async () => {
    const { projectId, clip, track } = await musicProject()
    const message =
      "A music track on this clip isn't ready. Pick another track or remove that music."
    const { clip: failed, thrown } = await renderClip(
      projectId,
      clip.id,
      { audioMix: music(track.id) },
      async () => {
        await musicRepository(env.db).update(track.id, {
          status: "processing",
          durationMs: null,
          peaks: null,
        })
        await failFast()
      }
    )
    expect(thrown).toMatchObject({ code: "CONFLICT", message })
    expect(failed).toMatchObject({ status: "failed", error: message })
  })

  it("fails when the clip's music track is in another workspace", async () => {
    const { projectId, clip } = await musicProject()
    const { track } = await workspaceWithTrack()
    const { clip: failed, thrown } = await renderClip(
      projectId,
      clip.id,
      { audioMix: music(track.id) },
      failFast
    )
    expect(thrown).toMatchObject({ code: "CONFLICT", message: trackGone })
    expect(failed).toMatchObject({ status: "failed", error: trackGone })
  })
})
