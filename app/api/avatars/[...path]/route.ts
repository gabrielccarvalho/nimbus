import type { NextRequest } from "next/server"

import { requireActor } from "@/features/accounts/session"
import { AppError } from "@/lib/errors"
import { errorResponse, fileResponse } from "@/lib/http/responses"
import { getStorage, parseAvatarKey } from "@/lib/storage"

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/avatars/[...path]">
) {
  try {
    const { path } = await ctx.params
    const key = [
      "avatars",
      ...path.map((part) => decodeURIComponent(part)),
    ].join("/")
    const avatar = parseAvatarKey(key)
    const viewer = await requireActor()
    const allowed =
      avatar?.owner === "users"
        ? avatar.id === viewer.user.id
        : avatar?.owner === "workspaces" && avatar.id === viewer.workspace.id
    if (!allowed) throw new AppError("NOT_FOUND", "File not found")
    return await fileResponse(request, getStorage(), key)
  } catch (error) {
    return errorResponse(error, { route: "avatars" })
  }
}
