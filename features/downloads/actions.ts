"use server"

import { getDb } from "@/lib/db"
import { runAction } from "@/lib/server-action"

import { importFromUrl } from "./service"

export async function importFromUrlAction(url: unknown) {
  return runAction("importFromUrl", () => importFromUrl(getDb(), url), ["/"])
}
