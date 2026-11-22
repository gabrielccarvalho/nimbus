import type { NextRequest } from "next/server"

import { getProjectSnapshot } from "@/features/pipeline/snapshot"
import { getDb } from "@/lib/db"
import { createPollingStream, SSE_HEADERS } from "@/lib/sse"

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/events">
) {
  const { id } = await ctx.params
  const db = getDb()
  if (!getProjectSnapshot(db, id)) {
    return new Response("Not found", { status: 404 })
  }
  const stream = createPollingStream({
    poll: () => getProjectSnapshot(db, id),
    signal: request.signal,
  })
  return new Response(stream, { headers: SSE_HEADERS })
}
