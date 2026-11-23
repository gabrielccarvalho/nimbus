import { FolderSimpleIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"

import { ImportPanel } from "@/components/projects/import-panel"
import { ProjectCard } from "@/components/projects/project-card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { listProjects } from "@/features/projects/queries"
import { getImportDefaults } from "@/features/settings/queries"
import { getEnv } from "@/lib/env"

export const metadata: Metadata = { title: "Projects" }

export default async function ProjectsPage() {
  const [projects, defaults] = await Promise.all([
    listProjects(),
    getImportDefaults(),
  ])

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Upload a recording or paste a video link to find clip-worthy moments.
          Every clip is a draft for you to review.
        </p>
      </div>
      <ImportPanel
        maxBytes={getEnv().MAX_UPLOAD_BYTES}
        defaults={defaults.defaults}
        claudeAvailable={defaults.claudeAvailable}
      />
      <section
        aria-labelledby="projects-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="projects-heading" className="font-heading text-lg font-medium">
          Your projects
        </h2>
        {projects.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderSimpleIcon />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Your uploads show up here with their progress and clips.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
