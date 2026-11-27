import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET as exportZip } from "@/app/api/projects/[id]/export/route"
import { clipRepository } from "@/features/clips/repository"
import type { ClipEdit } from "@/features/clips/schema"
import {
  approveAllCandidates,
  createClipFromRange,
  planClipEffects,
  setClipReviewStatus,
  updateClip,
} from "@/features/clips/service"
import { musicRepository } from "@/features/music/repository"
import {
  DEFAULT_AUDIO_MIX,
  newMusicClip,
  type MusicClip,
  type MusicTrackStatus,
} from "@/features/music/schema"
import { projectRepository } from "@/features/projects/repository"
import { startClipRenders } from "@/features/render/service"

import { assets, projects, workspaces } from "@/lib/db/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, setClipLayouts, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

vi.mock(
  "@/features/accounts/session",
  async () => (await import("../utils/viewer")).sessionMock
)

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function reviewedProject() {
  const { projectId } = await uploadFixture(fixtures.wide)
  const projects = projectRepository(env.db)
  await projects.updateSettings(projectId, {
    ...(await projects.getOrThrow(projectId)).settings,
    captionsEnabled: false,
  })
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  await setClipLayouts(env.db, projectId, camTop)
  const [clip] = await clipRepository(env.db).listForProject(projectId)
  return { projectId, clip: clip! }
}

const camTop: ClipEdit["layout"] = {
  webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "cam-top",
  camPosition: "top",
}

const edit = (overrides: Partial<Parameters<typeof updateClip>[3]> = {}) => ({
  startMs: 2000,
  endMs: 12_000,
  title: "Edited",
  hook: "New hook",
  captionOverrides: {
    pages: [{ index: 0, text: "fixed text" }],
    added: [],
    lanes: [],
  },
  layout: camTop,
  effects: null,
  audioMix: null,
  textOverlays: [],
  ...overrides,
})

const withTrack = (trackId: string, patch: Partial<MusicClip> = {}) => ({
  ...DEFAULT_AUDIO_MIX,
  music: [
    {
      ...newMusicClip(trackId, { startMs: 0, endMs: 10_000, lane: 0 }),
      ...patch,
    },
  ],
})

const request = (projectId: string) =>
  exportZip(new Request(`http://local/api/projects/${projectId}/export`), {
    params: Promise.resolve({ id: projectId }),
  })

describe("createClipFromRange", () => {
  it("adds a candidate titled from what was said", async () => {
    const { projectId } = await reviewedProject()
    const before = await clipRepository(env.db).listForProject(projectId)
    const clip = await createClipFromRange(env.db, projectId, {
      startMs: 8000,
      endMs: 14_000,
    })
    expect(clip.status).toBe("candidate")
    expect(clip.title).toMatch(/^No way!/)
    expect(clip.reason).toBe("Made from the transcript")
    expect(await clipRepository(env.db).listForProject(projectId)).toHaveLength(
      before.length + 1
    )
  })

  it("rejects ranges outside the recording or the length limits", async () => {
    const { projectId } = await reviewedProject()
    await expect(
      createClipFromRange(env.db, projectId, { startMs: 1000, endMs: 2000 })
    ).rejects.toThrow(/between 3 and 180 seconds/)
    await expect(
      createClipFromRange(env.db, projectId, { startMs: 15_000, endMs: 25_000 })
    ).rejects.toThrow(/inside the recording/)
  })
})

describe("updateClip", () => {
  it("saves the clip's own layout", async () => {
    const { projectId, clip } = await reviewedProject()
    const layout = {
      webcamRect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.4,
      mode: "split-50" as const,
      camPosition: "bottom" as const,
    }
    const saved = await updateClip(env.db, projectId, clip.id, edit({ layout }))
    expect(saved.layout).toEqual(layout)
    expect(
      (await clipRepository(env.db).listForProject(projectId))
        .filter((other) => other.id !== clip.id)
        .every((other) => other.layout.mode === "cam-top")
    ).toBe(true)
  })

  it("saves trim, text and caption edits", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = await updateClip(env.db, projectId, clip.id, {
      ...edit(),
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    expect(saved).toMatchObject({ title: "Edited", hook: "New hook" })
    expect(saved.captionOverrides?.pages).toEqual([
      { index: 0, text: "fixed text" },
    ])

    const trimmed = await updateClip(env.db, projectId, clip.id, edit())
    expect(trimmed).toMatchObject({ startMs: 2000, endMs: 12_000 })
    expect(trimmed.captionOverrides?.pages).toEqual([])
  })

  it("rejects out-of-range, too short and rendering clips", async () => {
    const { projectId, clip } = await reviewedProject()
    await expect(
      updateClip(env.db, projectId, clip.id, edit({ endMs: 25_000 }))
    ).rejects.toThrow(/inside the recording/)
    await expect(
      updateClip(env.db, projectId, clip.id, edit({ endMs: 4000 }))
    ).rejects.toThrow(/between 3 and 180/)
    await expect(updateClip(env.db, "nope", clip.id, edit())).rejects.toThrow(
      /not found/
    )
    await clipRepository(env.db).setStatus([clip.id], "rendering")
    await expect(
      updateClip(env.db, projectId, clip.id, edit())
    ).rejects.toThrow(/rendering/)
  })
})

async function addWorkspace() {
  const id = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id, name: "Studio" })
  return id
}

function addTrack(
  workspaceId: string,
  durationMs: number | null = 30_000,
  status: MusicTrackStatus = durationMs === null ? "processing" : "ready"
) {
  const id = crypto.randomUUID()
  return musicRepository(env.db).create({
    id,
    workspaceId,
    title: "Night drive",
    storageKey: `music/${workspaceId}/${id}.mp3`,
    mime: "audio/mpeg",
    status,
    durationMs,
    peaks: durationMs === null ? null : [],
  })
}

async function projectTrack(projectId: string, durationMs?: number) {
  const workspaceId = await addWorkspace()
  await env.db
    .update(projects)
    .set({ workspaceId })
    .where(eq(projects.id, projectId))
  return addTrack(workspaceId, durationMs)
}

describe("clip music and text", () => {
  const overlay = {
    text: "Wait for it",
    position: "top" as const,
    startMs: 0,
    endMs: 3000,
    lane: 0,
  }

  it("stores the music clips and on-screen texts, and clears them", async () => {
    const { projectId, clip } = await reviewedProject()
    const track = await projectTrack(projectId)
    const audioMix = withTrack(track.id)
    const later = { ...overlay, text: "Now", startMs: 5000, endMs: 7000 }
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ audioMix, textOverlays: [overlay, later] })
    )
    expect(saved.audioMix).toEqual(audioMix)
    expect(saved.textOverlays).toEqual([overlay, later])
    expect(await clipRepository(env.db).getOrThrow(clip.id)).toMatchObject({
      audioMix,
      textOverlays: [overlay, later],
    })

    const cleared = await updateClip(env.db, projectId, clip.id, edit())
    expect(cleared.audioMix).toBeNull()
    expect(cleared.textOverlays).toEqual([])
  })

  it("cuts texts, music and hand-written captions at the clip's end", async () => {
    const { projectId, clip } = await reviewedProject()
    const track = await projectTrack(projectId)
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        startMs: 2000,
        endMs: 8000,
        textOverlays: [
          { ...overlay, startMs: 4000, endMs: 9000 },
          { ...overlay, startMs: 5800, endMs: 9000, lane: 1 },
        ],
        audioMix: withTrack(track.id, { startMs: 1000, endMs: 9000 }),
        captionOverrides: {
          pages: [],
          added: [{ startMs: 5000, endMs: 7000, text: "late" }],
          lanes: [
            {
              baseline: 0.3,
              captions: [
                { startMs: 1000, endMs: 2000, text: "kept" },
                { startMs: 6500, endMs: 7000, text: "gone" },
              ],
            },
          ],
        },
      })
    )
    expect(saved.textOverlays).toEqual([
      { ...overlay, startMs: 4000, endMs: 6000 },
    ])
    expect(saved.audioMix?.music[0]).toMatchObject({
      startMs: 1000,
      endMs: 6000,
    })
    expect(saved.captionOverrides?.added).toEqual([
      { startMs: 5000, endMs: 6000, text: "late" },
    ])
    expect(saved.captionOverrides?.lanes).toEqual([
      {
        baseline: 0.3,
        captions: [{ startMs: 1000, endMs: 2000, text: "kept" }],
      },
    ])
  })

  it("rejects a track from another workspace or one that was deleted", async () => {
    const { projectId, clip } = await reviewedProject()
    const own = await projectTrack(projectId)
    const other = await addTrack(await addWorkspace())
    await expect(
      updateClip(
        env.db,
        projectId,
        clip.id,
        edit({ audioMix: withTrack(other.id) })
      )
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That music track is no longer in your library",
    })
    await musicRepository(env.db).delete(own.id)
    await expect(
      updateClip(
        env.db,
        projectId,
        clip.id,
        edit({ audioMix: withTrack(own.id) })
      )
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That music track is no longer in your library",
    })
    expect(
      (await clipRepository(env.db).getOrThrow(clip.id)).audioMix
    ).toBeNull()
  })

  it("needs the music to start before the track ends", async () => {
    const { projectId, clip } = await reviewedProject()
    const track = await projectTrack(projectId, 30_000)
    for (const inMs of [30_000, 45_000]) {
      await expect(
        updateClip(
          env.db,
          projectId,
          clip.id,
          edit({
            audioMix: withTrack(track.id, { inMs }),
          })
        )
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "Start the music before the track ends",
      })
    }
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        audioMix: withTrack(track.id, { inMs: 29_999 }),
      })
    )
    expect(saved.audioMix?.music[0]?.inMs).toBe(29_999)
  })

  it("saving an audioMix with a processing track is rejected", async () => {
    const { projectId, clip } = await reviewedProject()
    const ready = await projectTrack(projectId)
    const save = (trackId: string) =>
      updateClip(
        env.db,
        projectId,
        clip.id,
        edit({ audioMix: withTrack(trackId) })
      )
    const processing = await addTrack(ready.workspaceId, null)
    await expect(save(processing.id)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That music track is still processing. Pick it once it's ready.",
    })
    const failed = await addTrack(ready.workspaceId, null, "failed")
    await expect(save(failed.id)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That music track couldn't be read. Pick another track.",
    })
    expect(
      (await clipRepository(env.db).getOrThrow(clip.id)).audioMix
    ).toBeNull()
  })

  it("saves a mix without a track", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ audioMix: { ...DEFAULT_AUDIO_MIX, sourceDb: -6 } })
    )
    expect(saved.audioMix).toEqual({ ...DEFAULT_AUDIO_MIX, sourceDb: -6 })
  })
})

describe("clip effects", () => {
  const zoom = (startMs: number, endMs: number) => ({
    kind: "zoom" as const,
    startMs,
    endMs,
    scale: 1.4,
    focus: { x: 0.5, y: 0.5 },
    lane: 0,
  })

  it("clips edited effects to a new trim", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        startMs: 4000,
        endMs: 14_000,
        effects: {
          edited: true,
          events: [zoom(1000, 6000), zoom(20_000, 22_000)],
        },
      })
    )
    expect(saved.effects).toEqual({
      edited: true,
      events: [zoom(4000, 6000)],
    })
  })

  it("replans an auto track when the trim changes", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ startMs: 3000, endMs: 13_000, effects: null })
    )
    expect(saved.effects).toMatchObject({ edited: false })
    for (const event of saved.effects!.events) {
      expect(event.startMs).toBeGreaterThanOrEqual(3000)
      expect(event.endMs).toBeLessThanOrEqual(13_000)
    }
  })

  it("doesn't create a track when a trim saves over none", async () => {
    const { projectId, clip } = await reviewedProject()
    await clipRepository(env.db).update(clip.id, { effects: null })
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ startMs: 3000, endMs: 13_000 })
    )
    expect(saved.effects).toBeNull()
  })

  it("replans a trim with the layout being saved", async () => {
    const { projectId, clip } = await reviewedProject()
    const clips = clipRepository(env.db)
    const noCam = {
      webcamRect: null,
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "no-cam-fill" as const,
      camPosition: "top" as const,
    }
    await setClipLayouts(env.db, projectId, noCam)
    await clips.update(clip.id, {
      beats: [{ ms: 7000, kind: "reaction" }],
      effects: { edited: false, events: [] },
    })
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        startMs: 3000,
        endMs: 13_000,
        layout: {
          ...noCam,
          webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
          mode: "cam-top",
        },
      })
    )
    expect(saved.effects?.events.some((e) => e.kind === "focus")).toBe(true)
  })

  it("replans an auto track when only the layout changes", async () => {
    const { projectId, clip } = await reviewedProject()
    const clips = clipRepository(env.db)
    const noCam = {
      webcamRect: null,
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "no-cam-fill" as const,
      camPosition: "top" as const,
    }
    const same = { startMs: clip.startMs, endMs: clip.endMs }
    await clips.update(clip.id, {
      beats: [{ ms: clip.startMs + 3000, kind: "reaction" }],
      effects: { edited: false, events: [] },
      layout: noCam,
    })
    const relaidOut = {
      ...noCam,
      webcamRect: { x: 0.78, y: 0.77, w: 0.2, h: 0.2 },
      mode: "cam-top" as const,
    }
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ ...same, layout: relaidOut })
    )
    expect(saved.effects?.events.some((e) => e.kind === "focus")).toBe(true)

    const edited = {
      edited: true,
      events: [zoom(clip.startMs, clip.startMs + 2000)],
    }
    await clips.update(clip.id, { effects: edited })
    const kept = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ ...same, layout: noCam })
    )
    expect(kept.effects).toEqual(edited)
  })

  it("keeps the stored track when an untrimmed save omits effects", async () => {
    const { projectId, clip } = await reviewedProject()
    const clips = clipRepository(env.db)
    const same = { startMs: clip.startMs, endMs: clip.endMs }
    const edited = {
      edited: true,
      events: [zoom(clip.startMs, clip.startMs + 2000)],
    }
    await clips.update(clip.id, { effects: edited })
    await updateClip(env.db, projectId, clip.id, edit({ ...same }))
    expect((await clips.getOrThrow(clip.id)).effects).toEqual(edited)
    const auto = { edited: false, events: [] }
    await clips.update(clip.id, { effects: auto })
    await updateClip(env.db, projectId, clip.id, edit({ ...same }))
    expect((await clips.getOrThrow(clip.id)).effects).toEqual(auto)
  })

  it("clips a stored edited track when a trimmed save omits effects", async () => {
    const { projectId, clip } = await reviewedProject()
    const clips = clipRepository(env.db)
    await clips.update(clip.id, {
      effects: { edited: true, events: [zoom(1000, 6000)] },
    })
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({ startMs: 4000, endMs: 14_000 })
    )
    expect(saved.effects).toEqual({ edited: true, events: [zoom(4000, 6000)] })
  })

  it("planClipEffects needs a probed source", async () => {
    const { projectId, clip } = await reviewedProject()
    await env.db
      .update(assets)
      .set({ width: null })
      .where(eq(assets.projectId, projectId))
    await expect(
      planClipEffects(env.db, projectId, clip.id, {
        startMs: clip.startMs,
        endMs: clip.endMs,
        layout: camTop,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("keeps null when autoEffects is off", async () => {
    const { projectId, clip } = await reviewedProject()
    const projects = projectRepository(env.db)
    await projects.updateSettings(projectId, {
      ...(await projects.getOrThrow(projectId)).settings,
      autoEffects: false,
    })
    await clipRepository(env.db).update(clip.id, { effects: null })
    const saved = await updateClip(env.db, projectId, clip.id, edit())
    expect(saved.effects).toBeNull()
  })

  it("planClipEffects plans an unsaved range from stored beats without saving", async () => {
    const { projectId, clip } = await reviewedProject()
    const clips = clipRepository(env.db)
    await clips.update(clip.id, {
      status: "rendered",
      beats: [{ ms: 12_000, kind: "reaction" }],
      effects: { edited: true, events: [] },
    })
    const before = await clips.getOrThrow(clip.id)
    const range = { startMs: 8000, endMs: 18_000 }
    const effects = await planClipEffects(env.db, projectId, clip.id, {
      ...range,
      layout: camTop,
    })
    expect(effects.edited).toBe(false)
    expect(effects.events).toContainEqual(
      expect.objectContaining({ kind: "focus" })
    )
    for (const event of effects.events) {
      expect(event.startMs).toBeGreaterThanOrEqual(range.startMs)
      expect(event.endMs).toBeLessThanOrEqual(range.endMs)
    }
    expect(await clips.getOrThrow(clip.id)).toEqual(before)
  })

  it("planClipEffects uses the unsaved layout", async () => {
    const { projectId, clip } = await reviewedProject()
    await clipRepository(env.db).update(clip.id, {
      beats: [{ ms: clip.startMs + 4000, kind: "reaction" }],
    })
    const effects = await planClipEffects(env.db, projectId, clip.id, {
      startMs: clip.startMs,
      endMs: clip.endMs,
      layout: {
        webcamRect: null,
        gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
        gameplayFocusX: 0.5,
        mode: "no-cam-fill",
        camPosition: "top",
      },
    })
    expect(effects.events.some((event) => event.kind === "focus")).toBe(false)
  })

  it("moves a rendered clip back to approved when effects are saved", async () => {
    const { projectId, clip } = await reviewedProject()
    await clipRepository(env.db).update(clip.id, { status: "rendered" })
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        startMs: clip.startMs,
        endMs: clip.endMs,
        effects: {
          edited: true,
          events: [zoom(clip.startMs, clip.startMs + 2000)],
        },
      })
    )
    expect(saved.status).toBe("approved")
  })
})

describe("approveAllCandidates", () => {
  it("approves candidates and leaves rejected clips alone", async () => {
    const { projectId, clip } = await reviewedProject()
    await setClipReviewStatus(env.db, projectId, clip.id, "rejected")
    expect(await approveAllCandidates(env.db, projectId)).toBe(0)
    expect((await clipRepository(env.db).get(clip.id))?.status).toBe("rejected")
    await setClipReviewStatus(env.db, projectId, clip.id, "candidate")
    expect(await approveAllCandidates(env.db, projectId)).toBe(1)
    expect((await clipRepository(env.db).get(clip.id))?.status).toBe("approved")
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
    await setClipReviewStatus(env.db, projectId, clip.id, "approved")
    await startClipRenders(env.db, projectId, [clip.id])
    await runJobs(env.db, ["render_clip"])
    expect((await clipRepository(env.db).get(clip.id))?.status).toBe("rendered")

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

    const updated = await updateClip(env.db, projectId, clip.id, {
      ...edit(),
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    expect(updated.status).toBe("approved")
    expect(updated.renderAssetId).not.toBeNull()
  })
})

describe("clips joined from parts", () => {
  const parts = [
    { startMs: 12_000, endMs: 16_000 },
    { startMs: 2000, endMs: 6000 },
  ]

  it("stores the parts and puts the clip on its own timeline", async () => {
    const { projectId, clip } = await reviewedProject()
    const saved = await updateClip(env.db, projectId, clip.id, edit({ parts }))
    expect(saved).toMatchObject({ startMs: 12_000, endMs: 20_000, parts })
    expect(saved.captionOverrides?.pages).toEqual([])
  })

  it("is an ordinary clip again when its parts continue each other", async () => {
    const { projectId, clip } = await reviewedProject()
    await updateClip(env.db, projectId, clip.id, edit({ parts }))
    const saved = await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        parts: [
          { startMs: 2000, endMs: 6000 },
          { startMs: 6000, endMs: 12_000 },
        ],
      })
    )
    expect(saved).toMatchObject({ startMs: 2000, endMs: 12_000, parts: null })
  })

  it("rejects parts that overlap, leave the recording or add up too short", async () => {
    const { projectId, clip } = await reviewedProject()
    const save = (next: typeof parts) =>
      updateClip(env.db, projectId, clip.id, edit({ parts: next }))
    await expect(
      save([
        { startMs: 2000, endMs: 8000 },
        { startMs: 6000, endMs: 12_000 },
      ])
    ).rejects.toThrow("overlap")
    await expect(
      save([
        { startMs: 2000, endMs: 8000 },
        { startMs: 18_000, endMs: 26_000 },
      ])
    ).rejects.toThrow("inside the recording")
    await expect(
      save([
        { startMs: 2000, endMs: 3000 },
        { startMs: 10_000, endMs: 11_000 },
      ])
    ).rejects.toThrow("between")
  })

  it("renders the parts back to back", async () => {
    const { projectId, clip } = await reviewedProject()
    await updateClip(
      env.db,
      projectId,
      clip.id,
      edit({
        parts,
        effects: {
          edited: true,
          events: [
            {
              kind: "zoom",
              startMs: 15_000,
              endMs: 17_000,
              scale: 1.4,
              focus: { x: 0.5, y: 0.5 },
            },
          ],
        },
      })
    )
    await setClipReviewStatus(env.db, projectId, clip.id, "approved")
    await startClipRenders(env.db, projectId, [clip.id])
    await runJobs(env.db, ["render_clip"])
    const rendered = await clipRepository(env.db).get(clip.id)
    expect(rendered?.status).toBe("rendered")
    const [render] = await env.db
      .select()
      .from(assets)
      .where(eq(assets.id, rendered!.renderAssetId!))
    expect(render?.durationMs).toBe(8000)
  })
})
