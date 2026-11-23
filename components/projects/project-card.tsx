import { DotsThreeVerticalIcon, FilmStripIcon } from "@phosphor-icons/react/ssr"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Timeline, TimelineRange } from "@/components/ui/timeline"
import type { ProjectListItem } from "@/features/projects/repository"
import { formatDate, formatDuration, mediaUrl } from "@/lib/format"

import { DeleteProjectDialog } from "./delete-project-dialog"
import { ProjectStatusBadge } from "./status-badge"

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const clips = `${project.clipCount} ${project.clipCount === 1 ? "clip" : "clips"}`

  return (
    <article className="group relative grid gap-4 rounded-xl border bg-card p-3 text-card-foreground transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:border-foreground/20 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {project.thumbnailKey ? (
          <Image
            src={mediaUrl(project.thumbnailKey)}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 640px) 14rem, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <FilmStripIcon className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:py-1 sm:pe-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3 className="min-w-0 font-heading text-xl leading-tight font-bold">
            <Link
              href={`/projects/${project.id}`}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']"
            >
              {project.name}
            </Link>
          </h3>
          <div className="relative z-10 -me-1 -mt-1">
            <DeleteProjectDialog
              projectId={project.id}
              projectName={project.name}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${project.name}`}
                >
                  <DotsThreeVerticalIcon aria-hidden />
                </Button>
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <ProjectStatusBadge status={project.status} />
          <span>{clips}</span>
          <time dateTime={project.createdAt.toISOString()}>
            {formatDate(project.createdAt)}
          </time>
        </div>
        {project.durationMs ? (
          <div className="mt-auto flex flex-col gap-1">
            <Timeline
              readOnly
              durationMs={project.durationMs}
              aria-label={`${clips} across the ${formatDuration(project.durationMs)} recording`}
              className="h-6 rounded-md"
            >
              {project.audienceHeatmap?.map((point) => (
                <TimelineRange
                  key={point.startMs}
                  variant="audience"
                  startMs={point.startMs}
                  endMs={point.endMs}
                  style={{ opacity: point.value }}
                />
              ))}
              {project.clipRanges.map((range) => (
                <TimelineRange
                  key={range.startMs}
                  variant="selected"
                  startMs={range.startMs}
                  endMs={range.endMs}
                  className="min-w-1 border-x-0 bg-primary"
                />
              ))}
            </Timeline>
            <div
              aria-hidden
              className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums"
            >
              <span>0:00</span>
              <span>{formatDuration(project.durationMs)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}
