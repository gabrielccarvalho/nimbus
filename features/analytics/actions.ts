"use server"

import { requireActor } from "../accounts/session"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { runAction } from "@/lib/server-action"

import { RECONNECT_MESSAGE } from "../publishing/google-token"
import { publishingRepository } from "../publishing/repository"
import { enqueueUploadsSync } from "./service"

const ANALYTICS_PATH = "/analytics"

export async function importShortsAction() {
  return runAction(
    "importShorts",
    async () => {
      const { workspace } = await requireActor()
      const channel = await publishingRepository(getDb()).getChannel(
        workspace.id
      )
      if (!channel) throw new AppError("CONFLICT", "Connect YouTube first")
      if (channel.status !== "ok" || !channel.accountId) {
        throw new AppError("CONFLICT", RECONNECT_MESSAGE)
      }
      if (!(await enqueueUploadsSync(getDb(), channel.id))) {
        throw new AppError("CONFLICT", "Already importing your Shorts")
      }
    },
    [ANALYTICS_PATH]
  )
}
