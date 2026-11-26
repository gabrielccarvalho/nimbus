import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
import { logger } from "@/lib/logger"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})

afterEach(() => {
  env.cleanup()
})

async function seedProject(name = "Stream") {
  return projectRepository(env.db).create({
    name,
    settings: defaultProjectSettings,
  })
}

describe("migrations", () => {
  it("creates every table", async () => {
    const { rows } = (await env.db.execute(
      sql`select table_name as name from information_schema.tables where table_schema = 'public'`
    )) as unknown as { rows: { name: string }[] }
    expect(rows.map((t) => t.name)).toEqual(
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
  })
})

describe("projectRepository", () => {
  it("creates, lists and transitions projects", async () => {
    const repo = projectRepository(env.db)
    const project = await seedProject()
    expect(project.status).toBe("uploaded")
    expect(project.createdAt).toBeInstanceOf(Date)

    expect((await repo.transition(project.id, "probing")).status).toBe(
      "probing"
    )
    await expect(repo.transition(project.id, "done")).rejects.toThrow(AppError)

    const failed = await repo.markFailed(project.id, "ffprobe crashed")
    expect(failed).toMatchObject({
      status: "failed",
      failedStep: "probing",
      error: "ffprobe crashed",
    })
    expect((await repo.resumeFailed(project.id, "probing")).status).toBe(
      "probing"
    )
  })

  it("records the step a project was cancelled at", async () => {
    const repo = projectRepository(env.db)
    const project = await seedProject()
    await repo.transition(project.id, "probing")
    expect((await repo.transition(project.id, "cancelled")).failedStep).toBe(
      "probing"
    )
  })

  it("lists with clip counts, duration and thumbnail", async () => {
    const project = await seedProject()
    const assetsRepo = assetRepository(env.db)
    await assetsRepo.create({
      projectId: project.id,
      kind: "source",
      storageKey: `projects/${project.id}/source.mp4`,
      mime: "video/mp4",
      durationMs: 20_000,
    })
    await assetsRepo.create({
      projectId: project.id,
      kind: "thumbnail",
      storageKey: `projects/${project.id}/thumb.jpg`,
      mime: "image/jpeg",
    })
    await clipRepository(env.db).replaceCandidates(project.id, [
      { startMs: 0, endMs: 15_000, title: "A", score: 0.9 },
      { startMs: 16_000, endMs: 31_000, title: "B", score: 0.4 },
    ])
    const [item] = await projectRepository(env.db).list()
    expect(item).toMatchObject({
      clipCount: 2,
      durationMs: 20_000,
      thumbnailKey: `projects/${project.id}/thumb.jpg`,
    })
  })

  it("cascades deletes to dependent rows", async () => {
    const project = await seedProject()
    await assetRepository(env.db).create({
      projectId: project.id,
      kind: "source",
      storageKey: "k",
      mime: "video/mp4",
    })
    await transcriptRepository(env.db).save(project.id, {
      language: "en",
      words: [],
      segments: [],
    })
    await projectRepository(env.db).delete(project.id)
    expect(await assetRepository(env.db).listForProject(project.id)).toEqual([])
    expect(await transcriptRepository(env.db).get(project.id)).toBeUndefined()
  })

  it("throws NOT_FOUND for unknown ids", async () => {
    await expect(projectRepository(env.db).getOrThrow("nope")).rejects.toThrow(
      "Project not found"
    )
  })
})

describe("clipRepository", () => {
  it("replaces candidates but keeps approved clips", async () => {
    const project = await seedProject()
    const repo = clipRepository(env.db)
    const [first] = await repo.replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "Keep me", score: 0.5 },
      { startMs: 30_000, endMs: 50_000, title: "Drop me", score: 0.8 },
    ])
    await repo.setStatus([first!.id], "approved")
    await repo.replaceCandidates(project.id, [
      { startMs: 60_000, endMs: 80_000, title: "New", score: 0.7 },
    ])
    const titles = (await repo.listForProject(project.id)).map((c) => c.title)
    expect(titles).toEqual(["New", "Keep me"])
    expect(await repo.listByStatus(project.id, ["approved"])).toHaveLength(1)
  })

  it("updates caption overrides as JSON", async () => {
    const project = await seedProject()
    const repo = clipRepository(env.db)
    const [clip] = await repo.replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "A", score: 0.5 },
    ])
    const updated = await repo.update(clip!.id, {
      captionOverrides: {
        pages: [{ index: 0, text: "Hello" }],
        added: [],
        lanes: [],
      },
    })
    expect(updated.captionOverrides?.pages[0]?.text).toBe("Hello")
  })

  it("reads stored effects through the schema", async () => {
    const project = await seedProject()
    const repo = clipRepository(env.db)
    const [legacy, broken, none] = await repo.replaceCandidates(project.id, [
      { startMs: 0, endMs: 20_000, title: "Legacy", score: 0.5 },
      { startMs: 30_000, endMs: 50_000, title: "Broken", score: 0.4 },
      { startMs: 60_000, endMs: 70_000, title: "None", score: 0.3 },
    ])
    await env.db.execute(
      sql`update clips set effects = ${JSON.stringify({
        edited: true,
        events: [{ kind: "focus", startMs: 1000, endMs: 3000 }],
      })}::jsonb where id = ${legacy!.id}`
    )
    await env.db.execute(
      sql`update clips set effects = ${JSON.stringify({
        events: [{ kind: "spin" }],
      })}::jsonb where id = ${broken!.id}`
    )
    const focus = { kind: "focus", startMs: 1000, endMs: 3000, target: "cam" }
    expect((await repo.getOrThrow(legacy!.id)).effects).toEqual({
      edited: true,
      events: [focus],
    })
    expect(
      (await repo.listForProject(project.id)).map((clip) => clip.effects)
    ).toEqual([{ edited: true, events: [focus] }, null, null])
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    expect((await repo.getOrThrow(none!.id)).effects).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    expect((await repo.getOrThrow(broken!.id)).effects).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ clipId: broken!.id }),
      "invalid stored clip effects"
    )
    warn.mockRestore()
  })
})

describe("transcript, signals and layout repositories", () => {
  it("upserts transcripts and signals", async () => {
    const project = await seedProject()
    const words = [{ text: "hi", startMs: 0, endMs: 200, confidence: 0.9 }]
    await transcriptRepository(env.db).save(project.id, {
      language: "en",
      words,
      segments: [],
    })
    await transcriptRepository(env.db).save(project.id, {
      language: "pt",
      words,
      segments: [],
    })
    expect(await transcriptRepository(env.db).get(project.id)).toMatchObject({
      language: "pt",
      words,
    })

    await signalsRepository(env.db).save(project.id, {
      silences: [{ startMs: 1000, endMs: 2000 }],
      loudness: [-20, -18],
      loudnessIntervalMs: 250,
      speechDensity: [],
    })
    expect((await signalsRepository(env.db).get(project.id))?.loudness).toEqual(
      [-20, -18]
    )
  })

  it("saves layouts and one preset per resolution", async () => {
    const project = await seedProject()
    const repo = layoutRepository(env.db)
    const input = {
      webcamRect: { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top" as const,
    }
    await repo.upsert(project.id, { ...input, sourceAspect: "16:9" })
    expect((await repo.get(project.id))?.webcamRect).toEqual(input.webcamRect)

    await repo.savePreset(1920, 1080, input)
    await repo.savePreset(1920, 1080, { ...input, mode: "split-50" })
    expect(await repo.listPresets()).toHaveLength(1)
    expect((await repo.findPreset(1920, 1080))?.mode).toBe("split-50")
    expect(await repo.findPreset(2560, 1080)).toBeUndefined()
  })
})

describe("settingsRepository", () => {
  it("returns defaults until saved and validates on save", async () => {
    const repo = settingsRepository(env.db)
    expect(await repo.get()).toEqual(defaultAppSettings)
    expect((await repo.get({ selectorMode: "anthropic" })).selectorMode).toBe(
      "anthropic"
    )
    await repo.save({ ...defaultAppSettings, clipMaxMs: 45_000 })
    expect((await repo.get()).clipMaxMs).toBe(45_000)
    await expect(
      repo.save({ ...defaultAppSettings, clipMinMs: 60_000, clipMaxMs: 30_000 })
    ).rejects.toThrow()
  })
})
