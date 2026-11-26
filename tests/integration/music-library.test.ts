import { readFile } from "node:fs/promises"

import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET as musicGET } from "@/app/api/music/[id]/route"
import { accountRepository } from "@/features/accounts/repository"
import { deleteOwnedWorkspaces } from "@/features/accounts/service"
import { clipRepository } from "@/features/clips/repository"
import { trackInUseMessage } from "@/features/music/media"
import { musicTracksFor } from "@/features/music/queries"
import { musicRepository } from "@/features/music/repository"
import { deleteTrack, renameTrack } from "@/features/music/service"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import {
  DEFAULT_AUDIO_MIX,
  type MusicTrackSummary,
} from "@/features/music/schema"
import { startUploadAction } from "@/features/uploads/actions"
import { clips, user } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"
import { directUpload } from "../utils/uploads"

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

async function account(name: string) {
  const id = crypto.randomUUID()
  const owner = { id, name, email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  return { owner, actor: { userId: id, workspaceId: workspace.id } }
}

async function upload(fileName: string, file = fixtures.tone) {
  const result = await directUpload(
    { kind: "music", fileName },
    await readFile(file)
  )
  if (!result.ok) return { error: result.error }
  return { track: (result.value as { track: MusicTrackSummary }).track }
}

const getFile = (id: string, headers: Record<string, string> = {}) =>
  musicGET(new NextRequest(`http://localhost/api/music/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  })

async function clipWithTrack(workspaceId: string, trackId: string) {
  const project = await projectRepository(env.db).create({
    name: "Stream",
    workspaceId,
    settings: defaultProjectSettings,
  })
  const [clip] = await clipRepository(env.db).addCandidates(project.id, [
    { startMs: 0, endMs: 10_000, title: "Bridge fight" },
  ])
  await env.db
    .update(clips)
    .set({ audioMix: { ...DEFAULT_AUDIO_MIX, trackId } })
    .where(eq(clips.id, clip!.id))
  return clip!
}

describe("music uploads", () => {
  it("stores the track with its duration and waveform", async () => {
    const { owner, actor } = await account("Owner")
    signedIn.user = owner

    const summary = (await upload("summer_loop.m4a")).track!
    expect(summary).toMatchObject({
      url: `/api/music/${summary.id}`,
      status: "processing",
      durationMs: null,
      peaks: null,
    })

    await runJobs(env.db, ["probe_music"])
    const track = await musicRepository(env.db).get(summary.id)
    expect(track).toMatchObject({
      title: "summer loop",
      workspaceId: actor.workspaceId,
      createdBy: owner.id,
      storageKey: `music/${actor.workspaceId}/${summary.id}.m4a`,
      mime: "audio/mp4",
      status: "ready",
    })
    expect(Math.abs((track?.durationMs ?? 0) - 30_000)).toBeLessThanOrEqual(50)
    expect(track?.peaks).toHaveLength(240)
    expect((await getStorage().stat(track!.storageKey))?.bytes).toBe(
      track!.bytes
    )
    expect(await getStorage().list("tmp")).toEqual([])
  })

  it("rejects a file whose contents don't match its extension", async () => {
    const { owner } = await account("Owner")
    signedIn.user = owner
    expect(await upload("loop.mp3")).toEqual({
      error: {
        code: "UNSUPPORTED_MEDIA",
        message: "This file isn't the MP3 its name says it is",
      },
    })
    expect(await getStorage().list("music")).toEqual([])
  })

  it("lists a file without audio as failed until it's deleted", async () => {
    const { owner, actor } = await account("Owner")
    signedIn.user = owner
    const { id } = (await upload("silent.m4a", fixtures.noAudio)).track!
    await runJobs(env.db, ["probe_music"])

    expect(await musicTracksFor(env.db, actor.workspaceId)).toMatchObject([
      {
        id,
        status: "failed",
        error: "This file has no audio",
        durationMs: null,
        peaks: null,
      },
    ])
    expect(await getStorage().list("tmp")).toEqual([])
    await deleteTrack(env.db, getStorage(), actor.workspaceId, id)
    expect(await getStorage().list("music")).toEqual([])
  })

  it("rejects files that aren't audio", async () => {
    const { owner } = await account("Owner")
    signedIn.user = owner
    const { error } = await upload("song.mp3", fixtures.notVideo)
    expect(error).toEqual({
      code: "UNSUPPORTED_MEDIA",
      message: "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file",
    })
    expect(await getStorage().list("tmp")).toEqual([])
  })

  it("rejects an empty upload", async () => {
    const { owner } = await account("Owner")
    signedIn.user = owner
    expect(
      await directUpload(
        { kind: "music", fileName: "empty.mp3" },
        new Uint8Array()
      )
    ).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "The upload was empty" },
    })
  })

  it("rejects files over 50 MB before anything is sent", async () => {
    const { owner } = await account("Owner")
    signedIn.user = owner
    expect(
      await startUploadAction({
        kind: "music",
        fileName: "big.mp3",
        mime: "audio/mpeg",
        bytes: 51 * 1024 * 1024,
      })
    ).toEqual({
      ok: false,
      error: { code: "TOO_LARGE", message: "Music files can be up to 50 MB" },
    })
  })

  it("rejects files that are neither audio nor named like it", async () => {
    const { owner } = await account("Owner")
    signedIn.user = owner
    expect(
      await startUploadAction({
        kind: "music",
        fileName: "notes.txt",
        mime: "text/plain",
        bytes: 10,
      })
    ).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_MEDIA",
        message: "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file",
      },
    })
  })
})

describe("music library", () => {
  it("renames a track", async () => {
    const { owner, actor } = await account("Owner")
    signedIn.user = owner
    const id = (await upload("summer_loop.m4a")).track!.id

    await renameTrack(env.db, actor.workspaceId, id, "  Night drive  ")
    expect((await musicRepository(env.db).get(id))?.title).toBe("Night drive")
    await expect(
      renameTrack(env.db, actor.workspaceId, id, "  ")
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Give the track a name",
    })
  })

  it("deletes a track only while no clip uses it", async () => {
    const { owner, actor } = await account("Owner")
    signedIn.user = owner
    const storage = getStorage()
    const used = (await upload("used.m4a")).track!
    const free = (await upload("free.m4a")).track!
    const clip = await clipWithTrack(actor.workspaceId, used.id)
    const usedTrack = await musicRepository(env.db).get(used.id)
    const freeTrack = await musicRepository(env.db).get(free.id)

    await expect(
      deleteTrack(env.db, storage, actor.workspaceId, used.id)
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: trackInUseMessage([{ title: clip.title }]),
    })
    expect(await musicRepository(env.db).get(used.id)).toBeDefined()
    expect(await storage.stat(usedTrack!.storageKey)).not.toBeNull()

    await deleteTrack(env.db, storage, actor.workspaceId, free.id)
    expect(await musicRepository(env.db).get(free.id)).toBeUndefined()
    expect(await storage.stat(freeTrack!.storageKey)).toBeNull()
  })

  it("keeps tracks inside their workspace", async () => {
    const a = await account("A")
    const b = await account("B")
    signedIn.user = a.owner
    const { id } = (await upload("summer_loop.m4a")).track!
    const storage = getStorage()

    await expect(
      renameTrack(env.db, b.actor.workspaceId, id, "Mine")
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Track not found" })
    await expect(
      deleteTrack(env.db, storage, b.actor.workspaceId, id)
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Track not found" })

    const partial = await getFile(id, { range: "bytes=0-99" })
    expect(partial.status).toBe(206)
    expect(partial.headers.get("content-type")).toBe("audio/mp4")
    expect((await partial.arrayBuffer()).byteLength).toBe(100)

    signedIn.user = b.owner
    expect((await getFile(id)).status).toBe(404)
  })

  it("counts usage and storage, and goes with the workspace", async () => {
    const { owner, actor } = await account("Owner")
    signedIn.user = owner
    const storage = getStorage()
    const used = (await upload("used.m4a")).track!
    const free = (await upload("free.m4a")).track!
    await clipWithTrack(actor.workspaceId, used.id)
    await clipWithTrack(actor.workspaceId, used.id)
    const tracks = await musicRepository(env.db).listForWorkspace(
      actor.workspaceId
    )

    const counts = await musicRepository(env.db).usageCounts(actor.workspaceId)
    expect(counts.get(used.id)).toBe(2)
    expect(counts.get(free.id)).toBeUndefined()
    expect(
      await accountRepository(env.db).storageBytes(actor.workspaceId)
    ).toBe(tracks.reduce((sum, track) => sum + track.bytes, 0))

    await deleteOwnedWorkspaces(env.db, storage, owner.id)
    expect(await storage.list(`music/${actor.workspaceId}`)).toEqual([])
  })
})
