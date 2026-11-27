import { FolderSimpleIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"

import {
  AppHeader,
  AppHeaderActions,
  AppHeaderContext,
  AppHeaderHeading,
  AppHeaderState,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "@/components/app-shell/app-header"
import { SearchTrigger } from "@/components/app-shell/command-palette"
import { Page } from "@/components/app-shell/page"
import { ImportCard } from "@/components/projects/import-card"
import { NeedsYouBanner, ProjectGrid } from "@/components/projects/project-grid"
import { projectSignal } from "@/components/projects/status-badge"
import { buttonVariants } from "@/components/ui/button"
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
import { Kbd } from "@/components/ui/kbd"
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

  const needsYou = items.filter((p) => projectSignal(p).needsYou).length
  const summary = [
    `${items.length} ${items.length === 1 ? "recording" : "recordings"}`,
    needsYou > 0
      ? `${needsYou} ${needsYou === 1 ? "needs" : "need"} you`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <AppHeader>
        <AppHeaderHeading>
          <AppHeaderContext data-testid="greeting">
            {greeting(new Date().getHours())}
            {firstName ? `, ${firstName}` : ""}. Nothing leaves here until you
            approve it.
          </AppHeaderContext>
          <AppHeaderTitleRow>
            <AppHeaderTitle>Projects</AppHeaderTitle>
            {items.length > 0 && <AppHeaderState>· {summary}</AppHeaderState>}
          </AppHeaderTitleRow>
        </AppHeaderHeading>
        <AppHeaderActions className="flex-nowrap max-sm:flex-wrap">
          <SearchTrigger className="w-[300px] max-sm:w-full" />
          {items.length > 0 && (
            <a
              href="#import"
              aria-keyshortcuts="N"
              className={buttonVariants({ variant: "primary" })}
            >
              New project
              <Kbd className="bg-night/10 text-primary-foreground inset-ring-0">
                N
              </Kbd>
            </a>
          )}
        </AppHeaderActions>
      </AppHeader>
      <Page>
        {waiting && <NeedsYouBanner project={waiting} />}
        <ImportCard
          compact={items.length > 0}
          maxBytes={getEnv().MAX_UPLOAD_BYTES}
          defaults={defaults.defaults}
          claudeAvailable={defaults.claudeAvailable}
        />
        {items.length === 0 ? (
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderSimpleIcon />
              </EmptyMedia>
              <EmptyTitle>No recordings yet</EmptyTitle>
              <EmptyDescription>
                Drop a long recording or paste a link above and nimbus marks the
                moments worth a vertical clip. Each one shows up here with its
                clips and where it is in the pipeline.
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
