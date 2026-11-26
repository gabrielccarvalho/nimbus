import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { updateClip } from "@/features/clips/service"
import { trackInUseMessage } from "@/features/music/media"
import { musicRepository } from "@/features/music/repository"
import { DEFAULT_AUDIO_MIX, newMusicClip } from "@/features/music/schema"
import { deleteTrack } from "@/features/music/service"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { withTransaction, type Db } from "@/lib/db"
import { workspaces } from "@/lib/db/schema"
import { LocalStorage } from "@/lib/storage/local"

import {
  connect,
  dropDatabase,
  postgresReachable,
  recreateDatabase,
} from "../utils/postgres"

const NAME = `nimbus_music_race_${process.pid}`
const reachable = await postgresReachable()

async function seed(db: Db) {
  const workspaceId = crypto.randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const project = await projectRepository(db).create({
    workspaceId,
    name: "Stream",
    settings: defaultProjectSettings,
  })
  await assetRepository(db).create({
    projectId: project.id,
    kind: "source",
    storageKey: `projects/${project.id}/source.mp4`,
    mime: "video/mp4",
    durationMs: 60_000,
  })
  const [clip] = await clipRepository(db).addCandidates(project.id, [
    { startMs: 0, endMs: 20_000, title: "Bridge fight" },
  ])
  const track = await musicRepository(db).create({
    id: crypto.randomUUID(),
    workspaceId,
    title: "Night drive",
    storageKey: `music/${workspaceId}/night.mp3`,
    mime: "audio/mpeg",
    durationMs: 60_000,
    peaks: [],
  })
  const edit = {
    startMs: 0,
    endMs: 20_000,
    title: "Bridge fight",
    hook: "",
    captionOverrides: { pages: [], added: [], lanes: [] },
    layoutOverride: null,
    effects: null,
    audioMix: {
      ...DEFAULT_AUDIO_MIX,
      music: [newMusicClip(track.id, { startMs: 0, endMs: 20_000, lane: 0 })],
    },
    textOverlays: [],
  }
  return { workspaceId, projectId: project.id, clip: clip!, track, edit }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

describe.runIf(reachable)(
  "music track delete and clip save on Postgres",
  () => {
    let url: string
    let root: string

    beforeAll(async () => {
      url = await recreateDatabase(NAME)
      root = await mkdtemp(path.join(tmpdir(), "nimbus-music-race-"))
    }, 30_000)

    afterAll(async () => {
      await dropDatabase(NAME)
      await rm(root, { recursive: true, force: true })
    })

    it("a save waiting on a running delete finds the track gone", async () => {
      const { db, pool } = connect(url)
      try {
        const { workspaceId, projectId, clip, track, edit } = await seed(db)
        const storage = new LocalStorage(root)

        let saving: Promise<unknown> | undefined
        await withTransaction(db, async (tx) => {
          await deleteTrack(tx, storage, workspaceId, track.id)
          saving = updateClip(db, projectId, clip.id, edit).catch(
            (error: unknown) => error
          )
          await pause()
        })

        expect(await saving).toMatchObject({
          code: "VALIDATION",
          message: "That music track is no longer in your library",
        })
        expect(
          (await clipRepository(db).getOrThrow(clip.id)).audioMix
        ).toBeNull()
      } finally {
        await pool.end()
      }
    }, 30_000)

    it("a delete waiting on a running save sees the clip using the track", async () => {
      const { db, pool } = connect(url)
      try {
        const { workspaceId, projectId, clip, track, edit } = await seed(db)
        const storage = new LocalStorage(root)

        let deleting: Promise<unknown> | undefined
        await withTransaction(db, async (tx) => {
          await updateClip(tx, projectId, clip.id, edit)
          deleting = deleteTrack(db, storage, workspaceId, track.id).catch(
            (error: unknown) => error
          )
          await pause()
        })

        expect(await deleting).toMatchObject({
          code: "CONFLICT",
          message: trackInUseMessage([clip]),
        })
        expect(await musicRepository(db).get(track.id)).toBeDefined()
      } finally {
        await pool.end()
      }
    }, 30_000)
  }
)
