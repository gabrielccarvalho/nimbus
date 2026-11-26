import { receiveUpload } from "@/features/uploads/service"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { readableFromRequestBody } from "@/lib/http/request-body"
import { errorResponse } from "@/lib/http/responses"

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/uploads/[token]">
) {
  try {
    if (getEnv().STORAGE_DRIVER !== "local") {
      throw new AppError("NOT_FOUND", "Not found")
    }
    if (!request.body) throw new AppError("VALIDATION", "The upload was empty")
    const { token } = await ctx.params
    await receiveUpload(token, readableFromRequestBody(request.body))
    return new Response(null, { status: 204 })
  } catch (error) {
    return errorResponse(error, { route: "uploads" })
  }
}
