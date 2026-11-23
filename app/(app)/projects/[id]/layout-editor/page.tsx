import { FrameCornersIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LayoutEditor } from "@/components/projects/layout-editor"
import { projectStatusLabel } from "@/components/projects/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getProjectLayout } from "@/features/projects/queries"
import { mediaUrl } from "@/lib/format"

export const metadata: Metadata = { title: "Layout" }

export default async function LayoutPage({
  params,
}: PageProps<"/projects/[id]/layout-editor">) {
  const { id } = await params
  const data = await getProjectLayout(id)
  if (!data) notFound()
  const { project, source, video, layout } = data

  if (!layout || !video || !source?.width || !source.height) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FrameCornersIcon />
          </EmptyMedia>
          <EmptyTitle>Layout isn&apos;t ready</EmptyTitle>
          <EmptyDescription>
            The layout can be set once the recording has been probed. Current
            step: {projectStatusLabel(project.status)}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <LayoutEditor
      key={layout.updatedAt.getTime()}
      projectId={project.id}
      src={mediaUrl(video.storageKey)}
      sourceWidth={source.width}
      sourceHeight={source.height}
      initial={{
        webcamRect: layout.webcamRect,
        gameplayRect: layout.gameplayRect,
        gameplayFocusX: layout.gameplayFocusX,
        mode: layout.mode,
        camPosition: layout.camPosition,
      }}
      initialConfidence={layout.confidence}
      confirmed={layout.confirmedByUser}
      awaitingConfirmation={project.status === "awaiting_layout"}
    />
  )
}
