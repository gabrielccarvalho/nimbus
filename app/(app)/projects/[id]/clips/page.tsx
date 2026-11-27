import { FilmStripIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ClipsReview } from "@/components/projects/clips-review"
import { ManualSelection } from "@/components/projects/manual-selection"
import { review } from "@/components/projects/messages/review"
import { projectStatusLabel } from "@/components/projects/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { getProjectClips } from "@/features/projects/queries"
import { getPublishing } from "@/features/publishing/queries"
import { mediaUrl } from "@/lib/format"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(review)).clipsPage.title }
}

export default async function ClipsPage({
  params,
}: PageProps<"/projects/[id]/clips">) {
  const { id } = await params
  const [data, publishing, locale] = await Promise.all([
    getProjectClips(id),
    getPublishing(id),
    getLocale(),
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
  const t = review[locale].clipsPage

  return (
    <div className="flex flex-col gap-[22px]">
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
          captions={captions}
          snapshot={snapshot}
          publishing={publishing}
        />
      ) : manualPrompt ? null : (
        <Empty className="rounded-[18px] bg-graphite">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilmStripIcon />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {project.status === "failed"
                ? t.emptyFailed
                : t.emptyPending(projectStatusLabel(project.status, locale))}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
