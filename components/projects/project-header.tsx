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
import {
  formatBytes,
  formatDuration,
  formatRelativeDay,
  sourceLabel,
} from "@/lib/format"

import { DeleteProjectDialog } from "./delete-project-dialog"
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
  const signal = projectSignal({ ...project, reviewCount })
  const base = `/projects/${project.id}`
  const sourceHref = project.sourceUrl ?? source?.url

  const tabs: PageHeaderTab[] = [
    { href: base as Route, label: "Overview", exact: true },
    { href: `${base}/transcript` as Route, label: "Transcript" },
    { href: `${base}/clips` as Route, label: "Clips", count: clipCount },
  ]

  return (
    <PageHeader>
      <PageHeaderBack href="/" label="Back to projects" />
      <PageHeaderHeading>
        <PageHeaderContext>
          {sourceLabel(project.sourceUrl)} · imported{" "}
          {formatRelativeDay(project.createdAt).toLowerCase()}
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
                {formatBytes(source.bytes)}
              </span>
            </>
          ) : null}
          {language && ` · ${languageLabel(language)}`}
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
      <PageHeaderTabs aria-label="Project sections" tabs={tabs} />
      <PageHeaderDivider />
      <PageHeaderActions>
        {sourceHref && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open source video"
            nativeButton={false}
            render={<a href={sourceHref} target="_blank" rel="noreferrer" />}
          >
            <ArrowSquareOutIcon aria-hidden />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Project settings and more"
              />
            }
          >
            <DotsThreeIcon weight="bold" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontalIcon aria-hidden />
              Project settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <TrashIcon aria-hidden />
              Delete project
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
