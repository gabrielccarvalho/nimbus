import {
  ClockIcon,
  FilmSlateIcon,
  FilmStripIcon,
  FrameCornersIcon,
  HardDrivesIcon,
} from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"

import { AudioOverview } from "@/components/projects/audio-timeline"
import { ProjectActions } from "@/components/projects/project-actions"
import { ProjectLive } from "@/components/projects/project-live"
import {
  StatCard,
  StatCardGroup,
  StatCardIcon,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card"
import { getProject, getProjectOverview } from "@/features/projects/queries"
import { formatBytes, formatDuration, mediaUrl } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: (await getProject(id))?.name ?? "Project" }
}

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params
  const overview = await getProjectOverview(id)
  if (!overview) notFound()
  const { project, source, thumbnail, layout, clips, snapshot, audio } =
    overview

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <ProjectLive initial={snapshot} />
        <StatCardGroup aria-label="Source video">
          <StatCard size="sm">
            <StatCardLabel>
              <span className="truncate">Duration</span>
              <StatCardIcon>
                <ClockIcon />
              </StatCardIcon>
            </StatCardLabel>
            <StatCardValue data-testid="stat-duration">
              {formatDuration(source?.durationMs)}
            </StatCardValue>
          </StatCard>
          <StatCard size="sm">
            <StatCardLabel>
              <span className="truncate">Resolution</span>
              <StatCardIcon>
                <FrameCornersIcon />
              </StatCardIcon>
            </StatCardLabel>
            <StatCardValue data-testid="stat-resolution">
              {source?.width && source.height
                ? `${source.width}×${source.height}`
                : "—"}
            </StatCardValue>
          </StatCard>
          <StatCard size="sm">
            <StatCardLabel>
              <span className="truncate">Aspect</span>
              <StatCardIcon>
                <FrameCornersIcon />
              </StatCardIcon>
            </StatCardLabel>
            <StatCardValue data-testid="stat-aspect">
              {layout?.sourceAspect ?? "—"}
            </StatCardValue>
          </StatCard>
          <StatCard size="sm">
            <StatCardLabel>
              <span className="truncate">Size</span>
              <StatCardIcon>
                <HardDrivesIcon />
              </StatCardIcon>
            </StatCardLabel>
            <StatCardValue>{formatBytes(source?.bytes)}</StatCardValue>
          </StatCard>
          <StatCard size="sm">
            <StatCardLabel>
              <span className="truncate">Clips</span>
              <StatCardIcon>
                <FilmStripIcon />
              </StatCardIcon>
            </StatCardLabel>
            <StatCardValue>
              {clips.filter((c) => c.status !== "rejected").length}
            </StatCardValue>
          </StatCard>
        </StatCardGroup>
        {audio && source?.durationMs ? (
          <AudioOverview audio={audio} durationMs={source.durationMs} />
        ) : null}
      </div>
      <aside className="flex flex-col gap-4">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
          {thumbnail ? (
            <Image
              src={mediaUrl(thumbnail.storageKey)}
              alt=""
              fill
              unoptimized
              sizes="20rem"
              className="object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <FilmSlateIcon className="size-8" aria-hidden />
            </div>
          )}
        </div>
        <ProjectActions projectId={project.id} projectName={project.name} />
      </aside>
    </div>
  )
}
