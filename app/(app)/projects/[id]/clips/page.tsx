import { FilmStripIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ClipsReview } from "@/components/projects/clips-review"
import { ManualSelection } from "@/components/projects/manual-selection"
import { projectStatusLabel } from "@/components/projects/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getProjectClips } from "@/features/projects/queries"
import { mediaUrl } from "@/lib/format"

export const metadata: Metadata = { title: "Clips" }

export default async function ClipsPage({
  params,
}: PageProps<"/projects/[id]/clips">) {
  const { id } = await params
  const data = await getProjectClips(id)
  if (!data) notFound()
  const {
    project,
    clips,
    durationMs,
    video,
    audio,
    manualPrompt,
    renders,
    edit,
    layoutConfirmed,
    snapshot,
  } = data

  return (
    <div className="flex flex-col gap-6">
      {manualPrompt && (
        <ManualSelection projectId={project.id} prompt={manualPrompt} />
      )}
      {clips.length > 0 && video ? (
        <ClipsReview
          projectId={project.id}
          src={mediaUrl(video.storageKey)}
          durationMs={durationMs}
          clips={clips}
          audio={audio}
          renders={renders}
          edit={edit}
          layoutConfirmed={layoutConfirmed}
          snapshot={snapshot}
        />
      ) : manualPrompt ? null : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilmStripIcon />
            </EmptyMedia>
            <EmptyTitle>No clips yet</EmptyTitle>
            <EmptyDescription>
              {project.status === "failed"
                ? "The pipeline stopped before finding highlights. Retry it from the overview."
                : `Highlights appear here once selection finishes. Current step: ${projectStatusLabel(project.status)}.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
