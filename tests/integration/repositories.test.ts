import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { signalsRepository } from "@/features/analysis/repository"
import { clipRepository } from "@/features/clips/repository"
import { layoutRepository } from "@/features/layout/repository"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { settingsRepository } from "@/features/settings/repository"
import { defaultAppSettings } from "@/features/settings/schema"
import { transcriptRepository } from "@/features/transcription/repository"
import { AppError } from "@/lib/errors"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.cleanup()
})

function seedProject(name = "Stream") {
  return projectRepository(env.db).create({
    name,
    settings: defaultProjectSettings,
  })
}

describe("migrations", () => {
  it("creates every table with WAL and foreign keys on", () => {
    const tables = env.db.$client
      .prepare("select name from sqlite_master where type='table'")
      .all() as { name: string }[]
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "projects",
        "assets",
        "transcripts",
        "signals",
        "layouts",
        "layout_presets",
        "clips",
        "jobs",
        "settings",
      ])
    )
    expect(env.db.$client.pragma("journal_mode", { simple: true })).toBe("wal")
    expect(env.db.$client.pragma("foreign_keys", { simple: true })).toBe(1)
  })
})

describe("projectRepository", () => {
  it("creates, lists and transitions projects", () => {
    const repo = projectRepository(env.db)
    const project = seedProject()
    expect(project.status).toBe("uploaded")
    expect(project.createdAt).toBeInstanceOf(Date)

    expect(repo.transition(project.id, "probing").status).toBe("probing")
    expect(() => repo.transition(project.id, "done")).toThrow(AppError)

    const failed = repo.markFailed(project.id, "ffprobe crashed")
    expect(failed).toMatchObject({
      status: "failed",
      failedStep: "probing",
      error: "ffprobe crashed",
    })
    expect(repo.resumeFailed(project.id, "probing").status).toBe("probing")
  })

  it("records the step a project was cancelled at", () => {
    const repo = projectRepository(env.db)
    const project = seedProject()
    repo.transition(project.id, "probing")
    expect(repo.transition(project.id, "cancelled").failedStep).toBe("probing")
  })

  it("lists with clip counts, duration and thumbnail", () => {
    const project = seedProject()
    const assetsRepo = assetRepository(env.db)
    assetsRepo.create({
      projectId: project.id,
      kind: "source",
      storageKey: `projects/${project.id}/source.mp4`,
      mime: "video/mp4",
      durationMs: 20_000,
    })
    assetsRepo.create({
      projectId: project.id,
      kind: "thumbnail",
      storageKey: `projects/${project.id}/thumb.jpg`,
      mime: "image/jpeg",
    })
    clipRepository(env.db).replaceCandidates(project.id, [
      { startMs: 0, endMs: 15_000, title: "A", score: 0.9 },
      { startMs: 16_000, endMs: 31_000, title: "B", score: 0.4 },
    ])
    const [item] = projectRepository(env.db).list()
    expect(item).toMatchObject({
      clipCount: 2,
      durationMs: 20_000,
      thumbnailKey: `projects/${project.id}/thumb.jpg`,
    })
  })

  it("cascades deletes to dependent rows", () => {
    const project = seedProject()
    assetRepository(env.db).create({
      projectId: project.id,
      kind: "source",
      storageKey: "k",
      mime: "video/mp4",
    })
    transcriptRepository(env.db).save(project.id, {
      language: "en",
      words: [],
      segments: [],
    })
    projectRepository(env.db).delete(project.id)
    expect(assetRepository(env.db).listForProject(project.id)).toEqual([])
    expect(transcriptRepository(env.db).get(project.id)).toBeUndefined()
  })

  it("throws NOT_FOUND for unknown ids", () => {
    expect(() => projectRepository(env.db).getOrThrow("nope")).toThrow(
      "Project not found"
    )
  })
})

describe("clipRepository", () => {
  it("replaces candidates but keeps approved clips", () => {
    const project = seedProject()
    const repo = clipRepository(env.db)
    const [first] = repo.replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "Keep me", score: 0.5 },
      { startMs: 30_000, endMs: 50_000, title: "Drop me", score: 0.8 },
    ])
    repo.setStatus([first!.id], "approved")
    repo.replaceCandidates(project.id, [
      { startMs: 60_000, endMs: 80_000, title: "New", score: 0.7 },
    ])
    const titles = repo.listForProject(project.id).map((c) => c.title)
    expect(titles).toEqual(["New", "Keep me"])
    expect(repo.listByStatus(project.id, ["approved"])).toHaveLength(1)
  })

  it("updates caption overrides as JSON", () => {
    const project = seedProject()
    const repo = clipRepository(env.db)
    const [clip] = repo.replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
    ])
    const updated = repo.update(clip!.id, {
      captionOverrides: { pages: [{ index: 0, text: "Hello" }] },
    })
    expect(updated.captionOverrides?.pages[0]?.text).toBe("Hello")
  })
})

describe("transcript, signals and layout repositories", () => {
  it("upserts transcripts and signals", () => {
    const project = seedProject()
    const words = [{ text: "hi", startMs: 0, endMs: 200, confidence: 0.9 }]
    transcriptRepository(env.db).save(project.id, {
      language: "en",
      words,
      segments: [],
    })
    transcriptRepository(env.db).save(project.id, {
      language: "pt",
      words,
      segments: [],
    })
    expect(transcriptRepository(env.db).get(project.id)).toMatchObject({
      language: "pt",
      words,
    })

    signalsRepository(env.db).save(project.id, {
      silences: [{ startMs: 1000, endMs: 2000 }],
      loudness: [-20, -18],
      loudnessIntervalMs: 250,
      speechDensity: [],
    })
    expect(signalsRepository(env.db).get(project.id)?.loudness).toEqual([
      -20, -18,
    ])
  })

  it("saves layouts and one preset per resolution", () => {
    const project = seedProject()
    const repo = layoutRepository(env.db)
    const input = {
      webcamRect: { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top" as const,
    }
    repo.upsert(project.id, { ...input, sourceAspect: "16:9" })
    expect(repo.get(project.id)?.webcamRect).toEqual(input.webcamRect)

    repo.savePreset(1920, 1080, input)
    repo.savePreset(1920, 1080, { ...input, mode: "split-50" })
    expect(repo.listPresets()).toHaveLength(1)
    expect(repo.findPreset(1920, 1080)?.mode).toBe("split-50")
    expect(repo.findPreset(2560, 1080)).toBeUndefined()
  })
})

describe("settingsRepository", () => {
  it("returns defaults until saved and validates on save", () => {
    const repo = settingsRepository(env.db)
    expect(repo.get()).toEqual(defaultAppSettings)
    expect(repo.get({ selectorMode: "anthropic" }).selectorMode).toBe(
      "anthropic"
    )
    repo.save({ ...defaultAppSettings, clipMaxMs: 45_000 })
    expect(repo.get().clipMaxMs).toBe(45_000)
    expect(() =>
      repo.save({ ...defaultAppSettings, clipMinMs: 60_000, clipMaxMs: 30_000 })
    ).toThrow()
  })
})
