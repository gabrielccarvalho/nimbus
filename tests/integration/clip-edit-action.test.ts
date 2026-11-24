import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { updateClipAction } from "@/features/clips/actions"
import { clipRepository } from "@/features/clips/repository"
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

describe("updateClipAction", () => {
  it("returns the effects as stored, so the editor can show them", async () => {
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
    const result = await updateClipAction(project.id, clip!.id, {
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
})
