"use client"

import {
  ArrowSquareOutIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { usePathname } from "next/navigation"
import * as React from "react"

import {
  AppHeader,
  AppHeaderActions,
  AppHeaderBack,
  AppHeaderContext,
  AppHeaderDivider,
  AppHeaderHeading,
  AppHeaderTab,
  AppHeaderTabs,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "@/components/app-shell/app-header"
import {
  AppHeaderSlot,
  HEADER_STATE_SLOT_ID,
} from "@/components/app-shell/header-slot"
import { languageLabel } from "@/components/settings/settings-fields"
import { StatusPill } from "@/components/ui/status-pill"
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
import { IconAction } from "./icon-action"
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
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const signal = projectSignal({ ...project, reviewCount })
  const base = `/projects/${project.id}`
  const sourceHref = project.sourceUrl ?? source?.url

  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    {
      href: `${base}/transcript`,
      label: "Transcript",
      active: pathname.startsWith(`${base}/transcript`),
    },
    {
      href: `${base}/clips`,
      label: "Clips",
      active: pathname.startsWith(`${base}/clips`),
      count: clipCount,
    },
  ]

  return (
    <AppHeader>
      <AppHeaderBack href="/" label="Back to projects" />
      <AppHeaderHeading>
        <AppHeaderContext className="flex min-w-0 gap-x-1.5 overflow-hidden whitespace-nowrap">
          <span>
            {sourceLabel(project.sourceUrl)} · imported{" "}
            {formatRelativeDay(project.createdAt).toLowerCase()}
          </span>
          {source?.durationMs ? (
            <span className="font-mono tabular-nums">
              ·{" "}
              <span data-testid="stat-duration">
                {formatDuration(source.durationMs)}
              </span>
            </span>
          ) : null}
          {source?.width && source.height ? (
            <span className="font-mono tabular-nums">
              ·{" "}
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
            <span className="font-mono tabular-nums">
              · {formatBytes(source.bytes)}
            </span>
          ) : null}
          {language && <span>· {languageLabel(language)}</span>}
        </AppHeaderContext>
        <AppHeaderTitleRow>
          <AppHeaderTitle>{project.name}</AppHeaderTitle>
          <StatusPill
            tone={signal.tone}
            data-testid="project-status"
            className="py-[3px] text-xs"
          >
            {signal.label}
          </StatusPill>
          <span id={HEADER_STATE_SLOT_ID} className="contents" />
        </AppHeaderTitleRow>
      </AppHeaderHeading>
      <AppHeaderTabs aria-label="Project sections">
        {tabs.map((tab) => (
          <AppHeaderTab
            key={tab.href}
            href={tab.href as "/"}
            active={tab.active}
            count={tab.count}
          >
            {tab.label}
          </AppHeaderTab>
        ))}
      </AppHeaderTabs>
      <AppHeaderDivider />
      <AppHeaderActions className="gap-0.5">
        {sourceHref && (
          <IconAction
            label="Open source video"
            side="bottom"
            nativeButton={false}
            render={<a href={sourceHref} target="_blank" rel="noreferrer" />}
          >
            <ArrowSquareOutIcon aria-hidden />
          </IconAction>
        )}
        <IconAction
          label="Project settings"
          side="bottom"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >
          <SlidersHorizontalIcon aria-hidden />
        </IconAction>
        <IconAction
          label="Delete project"
          side="bottom"
          onClick={() => setDeleteOpen(true)}
        >
          <TrashIcon aria-hidden />
        </IconAction>
      </AppHeaderActions>
      <AppHeaderActions>
        <AppHeaderSlot />
      </AppHeaderActions>
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
    </AppHeader>
  )
}
