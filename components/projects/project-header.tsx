"use client"

import {
  ArrowSquareOutIcon,
  DotsThreeIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import type { Route } from "next"
import * as React from "react"

import {
  PageHeader,
  PageHeaderActions,
  PageHeaderBack,
  PageHeaderContext,
  PageHeaderDivider,
  PageHeaderHeading,
  PageHeaderState,
  PageHeaderTabs,
  PageHeaderTitle,
  PageHeaderTitleLine,
  type PageHeaderTab,
} from "@/components/app-shell/page-header"
import { languageLabel } from "@/components/settings/settings-fields"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SignalDot } from "@/components/ui/signal-dot"
import type {
  ProjectHeaderData,
  ProjectSettingsData,
} from "@/features/projects/queries"
import { formatBytes, formatDuration, formatRelativeDay } from "@/lib/format"
import { useLocale } from "@/lib/i18n/client"

import { DeleteProjectDialog } from "./delete-project-dialog"
import { localSourceLabel, overview } from "./messages/overview"
import { ProjectSettingsSheet } from "./project-settings-sheet"
import { projectSignal } from "./status-badge"

export function ProjectHeader({
  data,
  settings,
}: {
  data: ProjectHeaderData
  settings: ProjectSettingsData
}) {
  const { project, source, aspect, language, clipCount, reviewCount } = data
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const locale = useLocale()
  const t = overview[locale].header
  const signal = projectSignal({ ...project, reviewCount }, locale)
  const base = `/projects/${project.id}`
  const sourceHref = project.sourceUrl ?? source?.url

  const tabs: PageHeaderTab[] = [
    { href: base as Route, label: t.overview, exact: true },
    { href: `${base}/transcript` as Route, label: t.transcript },
    { href: `${base}/clips` as Route, label: t.clips, count: clipCount },
  ]

  return (
    <PageHeader>
      <PageHeaderBack href="/" label={t.back} />
      <PageHeaderHeading>
        <PageHeaderContext>
          {localSourceLabel(project.sourceUrl, locale)} ·{" "}
          {t.imported(
            formatRelativeDay(
              project.createdAt,
              undefined,
              locale
            ).toLocaleLowerCase(locale)
          )}
          {source?.durationMs ? (
            <>
              {" · "}
              <span
                className="font-mono tabular-nums"
                data-testid="stat-duration"
              >
                {formatDuration(source.durationMs)}
              </span>
            </>
          ) : null}
          {source?.width && source.height ? (
            <span className="font-mono tabular-nums">
              {" · "}
              <span data-testid="stat-resolution">
                {source.width}×{source.height}
              </span>
              {aspect && aspect !== "other" && (
                <>
                  {" · "}
                  <span data-testid="stat-aspect">{aspect}</span>
                </>
              )}
            </span>
          ) : null}
          {source?.bytes ? (
            <>
              {" · "}
              <span className="font-mono tabular-nums">
                {formatBytes(source.bytes, locale)}
              </span>
            </>
          ) : null}
          {language && ` · ${languageLabel(language, locale)}`}
        </PageHeaderContext>
        <PageHeaderTitleLine>
          <PageHeaderTitle>{project.name}</PageHeaderTitle>
          <PageHeaderState>
            <SignalDot
              tone={signal.tone}
              lit={signal.needsYou}
              size="sm"
              className="self-center"
            />
            <span data-testid="project-status">{signal.label}</span>
          </PageHeaderState>
        </PageHeaderTitleLine>
      </PageHeaderHeading>
      <PageHeaderTabs aria-label={t.sections} tabs={tabs} />
      <PageHeaderDivider />
      <PageHeaderActions>
        {sourceHref && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.openSource}
            nativeButton={false}
            render={<a href={sourceHref} target="_blank" rel="noreferrer" />}
          >
            <ArrowSquareOutIcon aria-hidden />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={t.more} />}
          >
            <DotsThreeIcon weight="bold" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontalIcon aria-hidden />
              {t.settings}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <TrashIcon aria-hidden />
              {t.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeaderActions>
      <ProjectSettingsSheet
        data={settings}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <DeleteProjectDialog
        projectId={project.id}
        projectName={project.name}
        redirectTo="/"
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </PageHeader>
  )
}
