import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { publishingDefaults } from "@/features/publishing/metadata"
import { projectRepository } from "@/features/projects/repository"
import {
  appSettingsSchema,
  defaultAppSettings,
} from "@/features/settings/schema"
import { getAppSettings, saveAppSettings } from "@/features/settings/service"
import { settings as settingsTable } from "@/lib/db/schema"
import { resetEnvCache } from "@/lib/env"

import { fixtures } from "../../scripts/make-fixtures"
import { uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("app settings", () => {
  it("falls back to env defaults until saved", async () => {
    process.env.WHISPER_LANGUAGE = "pt"
    process.env.VIDEO_ENCODER = "auto"
    resetEnvCache()
    expect(await getAppSettings(env.db)).toMatchObject({
      language: "pt",
      hardwareEncoding: true,
      selectorMode: "heuristic",
    })
  })

  it("defaults publishing settings when stored settings predate them", async () => {
    await env.db.insert(settingsTable).values({
      key: "app",
      value: { ...defaultAppSettings, publishPrivacy: undefined },
    })
    expect(await getAppSettings(env.db)).toMatchObject({
      publishPrivacy: "private",
      publishTags: [],
      publishHashtags: "#Shorts #gaming",
    })
  })

  it("round-trips publishing defaults", async () => {
    await saveAppSettings(env.db, {
      ...defaultAppSettings,
      publishPrivacy: "unlisted",
      publishTags: ["fps"],
    })
    const saved = await getAppSettings(env.db)
    expect(saved).toMatchObject({
      publishPrivacy: "unlisted",
      publishTags: ["fps"],
    })
    expect(publishingDefaults(saved)).toEqual({
      privacy: "unlisted",
      tags: ["fps"],
      hashtags: "#Shorts #gaming",
    })
  })

  it("applies saved settings to new projects", async () => {
    await saveAppSettings(env.db, {
      ...defaultAppSettings,
      targetClipCount: 3,
      captionsEnabled: false,
      renderQuality: "high",
    })
    expect(await getAppSettings(env.db)).toMatchObject({
      targetClipCount: 3,
      renderQuality: "high",
    })
    const { projectId } = await uploadFixture(fixtures.wide)
    expect(
      (await projectRepository(env.db).getOrThrow(projectId)).settings
    ).toMatchObject({ targetClipCount: 3, captionsEnabled: false })
  })

  it("rejects invalid settings with a readable message", async () => {
    const result = appSettingsSchema.safeParse({
      ...defaultAppSettings,
      clipMinMs: 60_000,
      clipMaxMs: 30_000,
    })
    expect(result.error?.issues[0]?.message).toMatch(/shorter than/)
    await expect(
      saveAppSettings(env.db, { ...defaultAppSettings, targetClipCount: 0 })
    ).rejects.toThrow()
  })
})
