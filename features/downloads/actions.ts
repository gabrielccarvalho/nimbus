"use server"

import { getDb } from "@/lib/db"

import { workspaceId } from "../accounts/session"
import { runAction } from "@/lib/server-action"

import { importFromUrl } from "./service"

export async function importFromUrlAction(url: unknown, options?: unknown) {
  return runAction(
    "importFromUrl",
    async () => importFromUrl(getDb(), url, options, await workspaceId()),
    ["/"]
  )
}
