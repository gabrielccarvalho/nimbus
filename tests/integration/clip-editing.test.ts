import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GET as exportZip } from "@/app/api/projects/[id]/export/route"
import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus, updateClip } from "@/features/clips/service"
import { confirmLayout } from "@/features/layout/service"
import { projectRepository } from "@/features/projects/repository"
import { startClipRenders } from "@/features/render/service"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})
afterEach(() => env.cleanup())

async function reviewedProject() {
  const { projectId } = await uploadFixture(fixtures.wide)
  const projects = projectRepository(env.db)
  projects.updateSettings(projectId, {
    ...projects.getOrThrow(projectId).settings,
    captionsEnabled: false,
  })
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  confirmLayout(env.db, projectId, {
    webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
    gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
    gameplayFocusX: 0.5,
    mode: "cam-top",
  })
  const [clip] = clipRepository(env.db).listForProject(projectId)
  return { projectId, clip: clip! }
}

const edit = (overrides: Partial<Parameters<typeof updateClip>[3]> = {}) => ({
  startMs: 2000,
  endMs: 12_000,
  title: "Edited",
  hook: "New hook",
  captionOverrides: { pages: [{ index: 0, text: "fixed text" }] },
  ...overrides,
})

const request = (projectId: string) =>
  exportZip(new Request(`http://local/api/projects/${projectId}/export`), {
    params: Promise.resolve({ id: projectId }),
  })

describe("updateClip", () => {
  it("saves trim, text and caption edits", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = updateClip(env.db, projectId, clip.id, {
      ...edit(),
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    expect(saved).toMatchObject({ title: "Edited", hook: "New hook" })
    expect(saved.captionOverrides?.pages).toEqual([
      { index: 0, text: "fixed text" },
    ])

    const trimmed = updateClip(env.db, projectId, clip.id, edit())
    expect(trimmed).toMatchObject({ startMs: 2000, endMs: 12_000 })
    expect(trimmed.captionOverrides?.pages).toEqual([])
  })

  it("rejects out-of-range, too short and rendering clips", async () => {
    const { projectId, clip } = await reviewedProject()
    expect(() =>
      updateClip(env.db, projectId, clip.id, edit({ endMs: 25_000 }))
    ).toThrow(/inside the recording/)
    expect(() =>
      updateClip(env.db, projectId, clip.id, edit({ endMs: 4000 }))
    ).toThrow(/between 3 and 180/)
    expect(() => updateClip(env.db, "nope", clip.id, edit())).toThrow(
      /not found/
    )
    clipRepository(env.db).setStatus([clip.id], "rendering")
    expect(() => updateClip(env.db, projectId, clip.id, edit())).toThrow(
      /rendering/
    )
  })
})

describe("export", () => {
  it("404s before anything is rendered", async () => {
    const { projectId } = await reviewedProject()
    const response = await request(projectId)
    expect(response.status).toBe(404)
  })

  it("zips rendered clips with a manifest and marks edited clips stale", async () => {
    const { projectId, clip } = await reviewedProject()
    setClipReviewStatus(env.db, projectId, clip.id, "approved")
    startClipRenders(env.db, projectId, [clip.id])
    await runJobs(env.db, ["render_clip"])
    expect(clipRepository(env.db).get(clip.id)?.status).toBe("rendered")

    const response = await request(projectId)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/zip")
    expect(response.headers.get("content-disposition")).toMatch(/-clips\.zip$/)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    const text = body.toString("latin1")
    expect(text).toContain(
      `01-${clip.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`
    )
    expect(text).toContain("clips.json")
    expect(body.length).toBeGreaterThan(100_000)

    const updated = updateClip(env.db, projectId, clip.id, {
      ...edit(),
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    expect(updated.status).toBe("approved")
    expect(updated.renderAssetId).not.toBeNull()
  })
})
