"use client"

import {
  ArrowSquareOutIcon,
  DotsThreeIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

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
import { cn } from "@/lib/utils"

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
      href: `${base}/layout`,
      label: "Layout & captions",
      active: pathname.startsWith(`${base}/layout`),
      pending: project.status === "awaiting_layout",
    },
    {
      href: `${base}/clips`,
      label: "Clips",
      active: pathname.startsWith(`${base}/clips`),
      count: clipCount,
    },
  ]

  return (
    <div className="mx-auto box-border grid w-full max-w-[1240px] gap-3.5 px-[max(20px,2.5vw)] pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 flex-[1_1_520px] gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 font-heading text-[26px] leading-[1.1] text-balance">
              {project.name}
            </h1>
            <StatusPill tone={signal.tone} data-testid="project-status">
              {signal.label}
            </StatusPill>
          </div>
          <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-tertiary">
            <span>
              {sourceLabel(project.sourceUrl)} · imported{" "}
              {formatRelativeDay(project.createdAt).toLowerCase()}
            </span>
            {source?.durationMs ? (
              <span
                className="font-mono tabular-nums"
                data-testid="stat-duration"
              >
                {formatDuration(source.durationMs)}
              </span>
            ) : null}
            {source?.width && source.height ? (
              <span className="font-mono tabular-nums">
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
                {formatBytes(source.bytes)}
              </span>
            ) : null}
            {language && <span>{languageLabel(language)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
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
        </div>
      </div>
      <nav
        aria-label="Project sections"
        className="-mx-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--hair)]"
      >
        <ul className="flex w-max gap-0.5 px-1 pb-2.5">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href as "/"}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm leading-tight font-medium tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground",
                  tab.active && "bg-glass-3 text-foreground hover:bg-glass-3"
                )}
              >
                {tab.label}
                {tab.pending && (
                  <SignalDot tone="amber" lit size="sm" label="Needs you" />
                )}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="font-mono text-[11px] font-semibold text-tertiary">
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
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
    </div>
  )
}
