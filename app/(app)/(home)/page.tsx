import { FolderSimpleIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"

import { Page } from "@/components/app-shell/page"
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
    <Page>
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-heading text-[32px] leading-[1.1]">Projects</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Drop in a long recording and Nimbus marks the moments worth a vertical
          clip. Nothing leaves here until you approve it.
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
        <div className="flex items-baseline gap-3">
          <h2 id="projects-heading" className="font-heading text-2xl font-bold">
            Recordings
          </h2>
          {projects.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {projects.length}
            </span>
          )}
        </div>
        {projects.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderSimpleIcon />
              </EmptyMedia>
              <EmptyTitle>No recordings yet</EmptyTitle>
              <EmptyDescription>
                Drop a recording or paste a link above. Each one shows up here
                with its clips marked along the timeline.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
