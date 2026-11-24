import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import {
  approveAllCandidatesAction,
  createClipAction,
  planClipEffectsAction,
  setClipStatusAction,
  submitManualSelectionAction,
  updateClipAction,
} from "@/features/clips/actions"
import { clipRepository } from "@/features/clips/repository"
import { confirmLayoutAction } from "@/features/layout/actions"
import {
  cancelProjectAction,
  deleteProjectAction,
  findMoreHighlightsAction,
  renameProjectAction,
  rerunProjectAction,
  retryProjectAction,
  updateProjectSettingsAction,
} from "@/features/projects/actions"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import {
  cancelClipRendersAction,
  cancelEditRenderAction,
  renderClipsAction,
  renderEditAction,
} from "@/features/render/actions"
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

async function createAccount(name: string) {
  const id = crypto.randomUUID()
  const account = { id, name, email: `${id}@example.com` }
  await env.db.insert(user).values(account)
  await accountRepository(env.db).createPersonalWorkspace(account)
  return account
}

describe("workspace isolation", () => {
  it("rejects every project action from another account and changes nothing", async () => {
    const owner = await createAccount("Owner")
    const other = await createAccount("Other")
    const workspace = await accountRepository(env.db).workspaceForUser(owner.id)
    const projects = projectRepository(env.db)
    const project = await projects.create({
      name: "Owner's stream",
      workspaceId: workspace!.id,
      settings: defaultProjectSettings,
    })
    const [clip] = await clipRepository(env.db).addCandidates(project.id, [
      { startMs: 0, endMs: 10_000, title: "Owner's clip" },
    ])

    signedIn.user = other
    const p = project.id
    const c = clip!.id
    const range = { startMs: 0, endMs: 10_000 }
    const attempts = {
      setClipStatus: setClipStatusAction(p, c, "rejected"),
      updateClip: updateClipAction(p, c, {
        ...range,
        title: "Stolen",
        hook: "",
        captionOverrides: { pages: [] },
      }),
      createClip: createClipAction(p, range),
      planClipEffects: planClipEffectsAction(p, c, range),
      approveAll: approveAllCandidatesAction(p),
      manualSelection: submitManualSelectionAction(p, "[]"),
      confirmLayout: confirmLayoutAction(p, {}),
      rename: renameProjectAction(p, "Stolen"),
      settings: updateProjectSettingsAction(p, defaultProjectSettings),
      rerun: rerunProjectAction(p, "select"),
      retry: retryProjectAction(p),
      cancel: cancelProjectAction(p),
      findMore: findMoreHighlightsAction(p),
      renderClips: renderClipsAction(p, [c]),
      renderEdit: renderEditAction(p),
      cancelRenders: cancelClipRendersAction(p),
      cancelEdit: cancelEditRenderAction(p),
      delete: deleteProjectAction(p),
    }
    for (const [name, attempt] of Object.entries(attempts)) {
      const result = await attempt
      expect(result.ok, name).toBe(false)
      if (!result.ok) expect(result.error.code, name).toBe("NOT_FOUND")
    }

    expect((await projects.get(p))?.name).toBe("Owner's stream")
    const clips = await clipRepository(env.db).listForProject(p)
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({
      title: "Owner's clip",
      status: "candidate",
    })

    signedIn.user = owner
    expect((await setClipStatusAction(p, c, "approved")).ok).toBe(true)
  })

  it("rejects project actions when signed out", async () => {
    signedIn.user = null
    const result = await retryProjectAction("any-project")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED")
  })
})
