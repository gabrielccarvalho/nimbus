"use server"

import { getDb } from "@/lib/db"
import { parseId, runAction } from "@/lib/server-action"
import { getStorage } from "@/lib/storage"

import { workspaceId } from "../accounts/session"
import { deleteTrack, renameTrack } from "./service"

const MUSIC_PATH = "/settings/workspace/music"

export async function renameMusicTrackAction(trackId: unknown, title: unknown) {
  return runAction(
    "renameMusicTrack",
    async () =>
      renameTrack(
        getDb(),
        await workspaceId(),
        parseId(trackId, "track id"),
        title
      ),
    [MUSIC_PATH]
  )
}

export async function deleteMusicTrackAction(trackId: unknown) {
  return runAction(
    "deleteMusicTrack",
    async () =>
      deleteTrack(
        getDb(),
        getStorage(),
        await workspaceId(),
        parseId(trackId, "track id")
      ),
    [MUSIC_PATH]
  )
}
