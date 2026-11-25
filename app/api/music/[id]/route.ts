import type { NextRequest } from "next/server"

import { requireActor } from "@/features/accounts/session"
import { musicRepository } from "@/features/music/repository"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { errorResponse, fileResponse } from "@/lib/http/responses"
import { getStorage } from "@/lib/storage"

async function serve(
  request: NextRequest,
  ctx: RouteContext<"/api/music/[id]">
) {
  try {
    const { id } = await ctx.params
    const { workspace } = await requireActor()
    const track = await musicRepository(getDb()).get(id)
    if (!track || track.workspaceId !== workspace.id) {
      throw new AppError("NOT_FOUND", "File not found")
    }
    return await fileResponse(request, getStorage(), track.storageKey)
  } catch (error) {
    return errorResponse(error, { route: "music" })
  }
}

export const GET = serve
export const HEAD = serve
