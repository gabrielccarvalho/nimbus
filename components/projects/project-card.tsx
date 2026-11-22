import { DotsThreeVerticalIcon, FilmStripIcon } from "@phosphor-icons/react/ssr"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProjectListItem } from "@/features/projects/repository"
import { formatDate, formatDuration, mediaUrl } from "@/lib/format"

import { DeleteProjectDialog } from "./delete-project-dialog"
import { ProjectStatusBadge } from "./status-badge"

export function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <Card className="group relative pt-0 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:ring-foreground/20">
      <div className="relative aspect-video bg-muted">
        {project.thumbnailKey ? (
          <Image
            src={mediaUrl(project.thumbnailKey)}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <FilmStripIcon className="size-8" aria-hidden />
          </div>
        )}
        <span className="absolute end-2 bottom-2 rounded-md bg-background/90 px-1.5 py-0.5 font-mono text-xs tabular-nums">
          {formatDuration(project.durationMs)}
        </span>
      </div>
      <CardContent className="flex flex-col gap-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link
            href={`/projects/${project.id}`}
            className="min-w-0 truncate font-medium outline-none after:absolute after:inset-0 after:content-['']"
          >
            {project.name}
          </Link>
          <div className="relative z-10">
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ProjectStatusBadge status={project.status} />
          <span>
            {project.clipCount} {project.clipCount === 1 ? "clip" : "clips"}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={project.createdAt.toISOString()}>
            {formatDate(project.createdAt)}
          </time>
        </div>
      </CardContent>
    </Card>
  )
}
