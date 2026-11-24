import type { NextRequest } from "next/server"

import { assertProjectAccess } from "@/features/accounts/session"
import { AppError } from "@/lib/errors"
import { errorResponse, fileResponse } from "@/lib/http/responses"
import { getStorage, isServableKey } from "@/lib/storage"

async function serve(
  request: NextRequest,
  ctx: RouteContext<"/api/media/[...path]">
) {
  try {
    const { path } = await ctx.params
    const key = path.map((part) => decodeURIComponent(part)).join("/")
    if (!isServableKey(key)) throw new AppError("NOT_FOUND", "File not found")
    await assertProjectAccess(key.split("/")[1]!)
    const download = request.nextUrl.searchParams.get("download") ?? undefined
    return await fileResponse(request, getStorage(), key, { download })
  } catch (error) {
    return errorResponse(error, { route: "media" })
  }
}

export const GET = serve
export const HEAD = serve
