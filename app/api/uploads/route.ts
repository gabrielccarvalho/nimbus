import { handleUpload } from "@/features/projects/upload"
import { errorResponse } from "@/lib/http/responses"

export async function POST(request: Request) {
  try {
    const result = await handleUpload(request)
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error, { route: "uploads" })
  }
}
