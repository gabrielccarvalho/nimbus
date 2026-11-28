import { TextAlignLeftIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { review } from "@/components/projects/messages/review"
import { projectStatusLabel } from "@/components/projects/status-badge"
import { TranscriptView } from "@/components/projects/transcript-view"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { getProjectTranscript } from "@/features/projects/queries"
import type { ProjectStatus } from "@/features/projects/schema"
import { mediaUrl } from "@/lib/format"

const PAST_TRANSCRIPTION: readonly ProjectStatus[] = [
  "analyzing",
  "selecting",
  "ready_for_review",
  "rendering",
  "done",
]

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(review)).transcriptPage.title }
}

export default async function TranscriptPage({
  params,
}: PageProps<"/projects/[id]/transcript">) {
  const { id } = await params
  const [data, locale] = await Promise.all([
    getProjectTranscript(id),
    getLocale(),
  ])
  if (!data) notFound()
  const { project, proxy, source, transcript, audio, clips } = data
  const video = proxy ?? source
  const t = review[locale].transcriptPage

  if (!transcript && PAST_TRANSCRIPTION.includes(project.status)) {
    return (
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TextAlignLeftIcon />
          </EmptyMedia>
          <EmptyTitle>{t.skippedTitle}</EmptyTitle>
          <EmptyDescription>
            {data.transcriptionAvailable ? t.skippedWithKey : t.skippedNoKey}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={
                  data.transcriptionAvailable
                    ? `/projects/${project.id}`
                    : "/settings/workspace"
                }
              />
            }
          >
            {data.transcriptionAvailable ? t.openOverview : t.addKey}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (!transcript || !video) {
    return (
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TextAlignLeftIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>
            {project.status === "failed"
              ? t.emptyFailed
              : t.emptyPending(projectStatusLabel(project.status, locale))}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <TranscriptView
      projectId={project.id}
      clips={clips}
      language={transcript.language}
      src={mediaUrl(video.storageKey)}
      durationMs={source?.durationMs ?? video.durationMs ?? 0}
      audio={audio}
      words={transcript.words}
      segments={transcript.segments}
    />
  )
}
