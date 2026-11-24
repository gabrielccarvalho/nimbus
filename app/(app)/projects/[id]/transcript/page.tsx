import { TextAlignLeftIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { projectStatusLabel } from "@/components/projects/status-badge"
import { TranscriptView } from "@/components/projects/transcript-view"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getProjectTranscript } from "@/features/projects/queries"
import { mediaUrl } from "@/lib/format"

export const metadata: Metadata = { title: "Transcript" }

export default async function TranscriptPage({
  params,
}: PageProps<"/projects/[id]/transcript">) {
  const { id } = await params
  const data = await getProjectTranscript(id)
  if (!data) notFound()
  const { project, proxy, source, transcript, audio } = data
  const video = proxy ?? source

  if (!transcript || !video) {
    return (
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TextAlignLeftIcon />
          </EmptyMedia>
          <EmptyTitle>No transcript yet</EmptyTitle>
          <EmptyDescription>
            {project.status === "failed"
              ? "Transcription didn't finish. Retry the project from the overview."
              : `The transcript appears here once transcription finishes. Current step: ${projectStatusLabel(project.status)}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <TranscriptView
      src={mediaUrl(video.storageKey)}
      durationMs={source?.durationMs ?? video.durationMs ?? 0}
      audio={audio}
      words={transcript.words}
      segments={transcript.segments}
    />
  )
}
