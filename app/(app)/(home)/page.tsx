import { FolderSimpleIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"

import { shell } from "@/components/app-shell/messages"
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
import { getMessages } from "@/lib/i18n/server"
import { requireViewer } from "@/features/accounts/session"
import { listProjects } from "@/features/projects/queries"
import { getImportDefaults } from "@/features/settings/queries"
import { getEnv } from "@/lib/env"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(shell)).home.title }
}

function greeting(hour: number) {
  if (hour < 5) return "upLate"
  if (hour < 12) return "morning"
  if (hour < 18) return "afternoon"
  return "evening"
}

export default async function ProjectsPage() {
  const [{ user }, projects, defaults, messages] = await Promise.all([
    requireViewer(),
    listProjects(),
    getImportDefaults(),
    getMessages(shell),
  ])
  const t = messages.home
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
            {t[greeting(new Date().getHours())]}
            {firstName ? `, ${firstName}` : ""}
          </PageHeaderContext>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page>
        <PageLede>
          {t.lede} <b className="font-medium text-foreground">{t.promise}</b>
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
              <EmptyTitle>{t.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ProjectGrid projects={items} />
        )}
      </Page>
    </>
  )
}
