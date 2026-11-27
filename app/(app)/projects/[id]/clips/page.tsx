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
import { getPublishing } from "@/features/publishing/queries"
import { mediaUrl } from "@/lib/format"

export const metadata: Metadata = { title: "Clips" }

export default async function ClipsPage({
  params,
}: PageProps<"/projects/[id]/clips">) {
  const { id } = await params
  const [data, publishing] = await Promise.all([
    getProjectClips(id),
    getPublishing(id),
  ])
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
    captions,
    snapshot,
  } = data

  const manual = manualPrompt ? (
    <ManualSelection projectId={project.id} prompt={manualPrompt} />
  ) : null

  if (clips.length > 0 && video) {
    return (
      <ClipsReview
        projectId={project.id}
        src={mediaUrl(video.storageKey)}
        durationMs={durationMs}
        clips={clips}
        audio={audio}
        renders={renders}
        edit={edit}
        captions={captions}
        snapshot={snapshot}
        publishing={publishing}
      >
        {manual}
      </ClipsReview>
    )
  }

  return (
    <div className="grid content-start gap-[18px] p-[18px]">
      {manual ?? (
        <Empty className="rounded-[18px] bg-graphite">
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
