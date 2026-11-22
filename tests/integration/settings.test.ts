import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { projectRepository } from "@/features/projects/repository"
import {
  appSettingsSchema,
  defaultAppSettings,
} from "@/features/settings/schema"
import { getAppSettings, saveAppSettings } from "@/features/settings/service"
import { resetEnvCache } from "@/lib/env"

import { fixtures } from "../../scripts/make-fixtures"
import { uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

describe("app settings", () => {
  it("falls back to env defaults until saved", () => {
    process.env.WHISPER_LANGUAGE = "pt"
    process.env.VIDEO_ENCODER = "auto"
    resetEnvCache()
    expect(getAppSettings(env.db)).toMatchObject({
      transcriptionLanguage: "pt",
      hardwareEncoding: true,
      selectorMode: "heuristic",
    })
  })

  it("applies saved settings to new projects", async () => {
    saveAppSettings(env.db, {
      ...defaultAppSettings,
      targetClipCount: 3,
      captionsEnabled: false,
      renderQuality: "high",
    })
    expect(getAppSettings(env.db)).toMatchObject({
      targetClipCount: 3,
      renderQuality: "high",
    })
    const { projectId } = await uploadFixture(fixtures.wide)
    expect(
      projectRepository(env.db).getOrThrow(projectId).settings
    ).toMatchObject({ targetClipCount: 3, captionsEnabled: false })
  })

  it("rejects invalid settings with a readable message", () => {
    const result = appSettingsSchema.safeParse({
      ...defaultAppSettings,
      clipMinMs: 60_000,
      clipMaxMs: 30_000,
    })
    expect(result.error?.issues[0]?.message).toMatch(/shorter than/)
    expect(() =>
      saveAppSettings(env.db, { ...defaultAppSettings, targetClipCount: 0 })
    ).toThrow()
  })
})
