"use server"

import { headers } from "next/headers"
import { z } from "zod"

import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { parseId, runAction } from "@/lib/server-action"
import { getStorage } from "@/lib/storage"

import { workspaceId } from "../accounts/session"
import { deleteTrack, renameTrack } from "./service"
import { regionFromLanguages, searchMusicFor } from "./trending"

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

const musicQuerySchema = z.string().trim().min(2).max(100)

function parseMusicQuery(input: unknown) {
  const parsed = musicQuerySchema.safeParse(input)
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Type 2 to 100 characters to search")
  }
  return parsed.data
}

export async function searchMusicAction(query: unknown) {
  return runAction(
    "searchMusic",
    async () =>
      searchMusicFor(
        getDb(),
        await workspaceId(),
        regionFromLanguages((await headers()).get("accept-language")),
        parseMusicQuery(query)
      ),
    []
  )
}
