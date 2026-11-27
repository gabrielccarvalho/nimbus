"use client"

import { ArrowRightIcon, CaretDownIcon } from "@phosphor-icons/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SignalDot } from "@/components/ui/signal-dot"
import { StatusPill } from "@/components/ui/status-pill"
import { toneVariants } from "@/components/ui/tone"
import type { ProjectStatus } from "@/features/projects/schema"
import {
  formatBytes,
  formatDuration,
  formatRelativeDay,
  mediaUrl,
} from "@/lib/format"
import { useLocale } from "@/lib/i18n/client"
import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

import { localSourceLabel, overview } from "./messages/overview"
import {
  projectFilter,
  projectSignal,
  type ProjectFilter,
} from "./status-badge"

export type ProjectGridItem = {
  id: string
  name: string
  status: ProjectStatus
  failedStep: ProjectStatus | null
  awaitingManualSelection: boolean
  reviewCount: number
  clipCount: number
  createdAt: string
  sourceUrl: string | null
  durationMs: number | null
  width: number | null
  height: number | null
  bytes: number | null
  thumbnailKey: string | null
  progress: number | null
}

const FILTERS = ["all", "needs", "processing", "ready", "done"] as const

const SORTS = ["recent", "oldest", "name"] as const

type Sort = (typeof SORTS)[number]

function meta(project: ProjectGridItem, locale: Locale) {
  return [
    formatRelativeDay(new Date(project.createdAt), undefined, locale),
    localSourceLabel(project.sourceUrl, locale),
    project.width && project.height
      ? `${project.width}×${project.height}`
      : null,
    project.bytes ? formatBytes(project.bytes, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function NeedsYouBanner({ project }: { project: ProjectGridItem }) {
  const locale = useLocale()
  const signal = projectSignal(project, locale)
  return (
    <Link
      href={`/projects/${project.id}/clips`}
      className="flex flex-wrap items-center gap-3.5 rounded-[18px] bg-graphite px-[18px] py-3.5 transition-colors hover:bg-graphite-2"
    >
      <SignalDot tone="amber" lit />
      <span className="min-w-0 flex-[1_1_300px] text-sm">
        <b className="font-semibold">{project.name}</b>{" "}
        <span className="text-muted-foreground">
          {overview[locale].grid.waiting}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold">
        {signal.detail}
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </span>
    </Link>
  )
}

function ProjectTile({ project }: { project: ProjectGridItem }) {
  const locale = useLocale()
  const signal = projectSignal(project, locale)
  const processing = projectFilter(project) === "processing"
  return (
    <article className="group relative grid min-w-0 gap-3 rounded-[14px] focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-lav">
      <div
        className={cn(
          toneVariants({ tone: signal.tone }),
          "relative aspect-video overflow-hidden rounded-[14px] bg-graphite-2 bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.07)_1px,transparent_1.5px)] bg-size-[11px_11px] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(closest-side_at_50%_62%,rgb(var(--tone)/0.14),transparent)]"
        )}
      >
        {project.thumbnailKey && (
          <Image
            src={mediaUrl(project.thumbnailKey)}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 40vw, 100vw"
            className="object-cover transition-opacity group-hover:opacity-90"
          />
        )}
        <span className="absolute end-2.5 bottom-2.5 z-10 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold backdrop-blur-sm">
          {project.durationMs ? formatDuration(project.durationMs) : "—"}
        </span>
        {project.clipCount > 0 && (
          <span className="absolute start-2.5 bottom-2.5 z-10 rounded-[7px] bg-night/72 px-[7px] py-[5px] text-xs leading-none font-semibold backdrop-blur-sm">
            {overview[locale].grid.clips(project.clipCount)}
          </span>
        )}
      </div>
      <div className="grid gap-1.5 px-0.5">
        <div className="flex items-start justify-between gap-2.5">
          <h3 className="min-w-0 text-[15px] leading-snug font-semibold tracking-[-0.015em]">
            <Link
              href={`/projects/${project.id}`}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']"
            >
              {project.name}
            </Link>
          </h3>
          <StatusPill tone={signal.tone} className="shrink-0">
            {signal.label}
          </StatusPill>
        </div>
        <span className="text-[12.5px] text-tertiary">
          {meta(project, locale)}
        </span>
        {processing && (
          <div
            aria-hidden
            className="h-1 overflow-hidden rounded-full bg-white/8"
          >
            <i
              className="block h-full rounded-full bg-lav transition-[width] duration-500"
              style={{ width: `${Math.round(project.progress ?? 0)}%` }}
            />
          </div>
        )}
      </div>
    </article>
  )
}

export function ProjectGrid({ projects }: { projects: ProjectGridItem[] }) {
  const [filter, setFilter] = React.useState<ProjectFilter | "all">("all")
  const [sort, setSort] = React.useState<Sort>("recent")
  const router = useRouter()
  const locale = useLocale()
  const t = overview[locale].grid
  const anyProcessing = projects.some((p) => projectFilter(p) === "processing")

  React.useEffect(() => {
    if (!anyProcessing) return
    const timer = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(timer)
  }, [anyProcessing, router])

  const counts = new Map<string, number>([["all", projects.length]])
  for (const project of projects) {
    const key = projectFilter(project)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const shown = projects
    .filter((p) => filter === "all" || projectFilter(p) === filter)
    .toSorted((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, locale)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt)
    )

  return (
    <section aria-label={t.recordings} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t.filterRecordings}
          className="flex flex-wrap gap-0.5"
        >
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-pressed:bg-glass-3 aria-pressed:text-foreground"
            >
              {t.filters[id]}{" "}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {counts.get(id) ?? 0}
              </span>
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground">
            {t.sorts[sort]}
            <CaretDownIcon className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as Sort)}
            >
              {SORTS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t.sorts[value]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-tertiary">{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
          {shown.map((project) => (
            <li key={project.id}>
              <ProjectTile project={project} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
