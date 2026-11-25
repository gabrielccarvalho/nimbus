import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { textOverlaySchema } from "@/features/captions/overlay"
import { updateClipAction } from "@/features/clips/actions"
import { clipRepository } from "@/features/clips/repository"
import { audioMixSchema, DEFAULT_AUDIO_MIX } from "@/features/music/schema"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { user } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

const signedIn: { user: { id: string; name: string } | null } = { user: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/features/accounts/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        signedIn.user && { user: signedIn.user, session: {} },
    },
  }),
}))

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed() {
  const id = crypto.randomUUID()
  const owner = { id, name: "Owner", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  const project = await projectRepository(env.db).create({
    name: "Stream",
    workspaceId: workspace.id,
    settings: defaultProjectSettings,
  })
  await assetRepository(env.db).create({
    projectId: project.id,
    kind: "source",
    storageKey: `projects/${project.id}/source.mp4`,
    mime: "video/mp4",
    durationMs: 60_000,
  })
  const [clip] = await clipRepository(env.db).addCandidates(project.id, [
    { startMs: 1_000, endMs: 20_000, title: "Clip" },
  ])
  signedIn.user = owner
  return { project, clip: clip! }
}

describe("updateClipAction", () => {
  it("returns the effects as stored, so the editor can show them", async () => {
    const { project, clip } = await seed()
    const result = await updateClipAction(project.id, clip.id, {
      startMs: 1_000,
      endMs: 20_000,
      title: "Clip",
      hook: "",
      captionOverrides: { pages: [] },
      effects: {
        edited: true,
        events: [
          { kind: "focus", target: "game", startMs: 0, endMs: 2_000 },
          { kind: "shake", intensity: "light", startMs: 5_000, endMs: 5_500 },
        ],
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effects).toEqual({
      edited: true,
      events: [
        { kind: "focus", target: "game", startMs: 1_000, endMs: 2_000 },
        { kind: "shake", intensity: "light", startMs: 5_000, endMs: 5_500 },
      ],
    })
  })

  it("rejects on-screen text over 80 characters and music louder than 0 dB", async () => {
    const { project, clip } = await seed()
    const base = {
      startMs: 1_000,
      endMs: 20_000,
      title: "Clip",
      hook: "",
      captionOverrides: { pages: [] },
    }
    const textOverlay = { text: "a".repeat(81), position: "top", untilMs: 3000 }
    const audioMix = { ...DEFAULT_AUDIO_MIX, musicDb: 3 }
    const cases = [
      {
        payload: { textOverlay },
        message:
          textOverlaySchema.safeParse(textOverlay).error?.issues[0]?.message,
      },
      {
        payload: { audioMix },
        message: audioMixSchema.safeParse(audioMix).error?.issues[0]?.message,
      },
    ]
    for (const { payload, message } of cases) {
      expect(message).toBeDefined()
      const result = await updateClipAction(project.id, clip.id, {
        ...base,
        ...payload,
      })
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION", message },
      })
    }
    expect(await clipRepository(env.db).getOrThrow(clip.id)).toMatchObject({
      audioMix: null,
      textOverlay: null,
    })
  })
})
