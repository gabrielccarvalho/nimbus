import type { NextRequest } from "next/server"

import { assertProjectAccess } from "@/features/accounts/session"
import { getProjectSnapshot } from "@/features/pipeline/snapshot"
import { getDb } from "@/lib/db"
import { errorResponse } from "@/lib/http/responses"
import { createPollingStream, SSE_HEADERS } from "@/lib/sse"

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/events">
) {
  const { id } = await ctx.params
  try {
    await assertProjectAccess(id)
  } catch (error) {
    return errorResponse(error, { route: "events" })
  }
  const db = getDb()
  if (!(await getProjectSnapshot(db, id))) {
    return new Response("Not found", { status: 404 })
  }
  const stream = createPollingStream({
    poll: () => getProjectSnapshot(db, id),
    signal: request.signal,
  })
  return new Response(stream, { headers: SSE_HEADERS })
}
