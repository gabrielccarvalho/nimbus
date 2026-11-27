import { FolderSimpleIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"

import { Page, PageLede } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { ImportCard } from "@/components/projects/import-card"
import { NeedsYouBanner, ProjectGrid } from "@/components/projects/project-grid"
import { projectSignal } from "@/components/projects/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { requireViewer } from "@/features/accounts/session"
import { listProjects } from "@/features/projects/queries"
import { getImportDefaults } from "@/features/settings/queries"
import { getEnv } from "@/lib/env"

export const metadata: Metadata = { title: "Projects" }

function greeting(hour: number) {
  if (hour < 5) return "Up late"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default async function ProjectsPage() {
  const [{ user }, projects, defaults] = await Promise.all([
    requireViewer(),
    listProjects(),
    getImportDefaults(),
  ])
  const items = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    failedStep: p.failedStep,
    awaitingManualSelection: p.awaitingManualSelection,
    reviewCount: p.reviewCount,
    clipCount: p.clipCount,
    createdAt: p.createdAt.toISOString(),
    sourceUrl: p.sourceUrl,
    durationMs: p.durationMs,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    thumbnailKey: p.thumbnailKey,
    progress: p.progress,
  }))
  const waiting = items.find((p) => projectSignal(p).needsYou)
  const firstName = user.name.trim().split(/\s+/)[0]

  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>
            {greeting(new Date().getHours())}
            {firstName ? `, ${firstName}` : ""}
          </PageHeaderContext>
          <PageHeaderTitle>Projects</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page>
        <PageLede>
          Drop a long recording and nimbus marks the moments worth a vertical
          clip.{" "}
          <b className="font-medium text-foreground">
            Nothing leaves here until you approve it.
          </b>
        </PageLede>
        <ImportCard
          maxBytes={getEnv().MAX_UPLOAD_BYTES}
          defaults={defaults.defaults}
          claudeAvailable={defaults.claudeAvailable}
        />
        {waiting && <NeedsYouBanner project={waiting} />}
        {items.length === 0 ? (
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderSimpleIcon />
              </EmptyMedia>
              <EmptyTitle>No recordings yet</EmptyTitle>
              <EmptyDescription>
                Drop a recording or paste a link above. Each one shows up here
                with its clips and where it is in the pipeline.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ProjectGrid projects={items} />
        )}
      </Page>
    </>
  )
}
