import { requireActor } from "@/features/accounts/session"
import { handleMusicUpload } from "@/features/music/service"
import { errorResponse } from "@/lib/http/responses"

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActor()
    const track = await handleMusicUpload(request, {
      workspaceId: workspace.id,
      userId: user.id,
    })
    return Response.json({ track }, { status: 201 })
  } catch (error) {
    return errorResponse(error, { route: "uploads/music" })
  }
}
