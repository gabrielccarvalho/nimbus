"use client"

import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  DownloadSimpleIcon,
  MonitorPlayIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { SignalDot } from "@/components/ui/signal-dot"
import type { Tone } from "@/components/ui/tone"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ClipStatus } from "@/features/clips/schema"
import type { ProjectSettingsData } from "@/features/projects/queries"
import type { RenderQuality } from "@/features/projects/schema"
import { retryPublicationAction } from "@/features/publishing/actions"
import { ACTIVE_PUBLICATION_STATUSES } from "@/features/publishing/schema"
import { formatBytes } from "@/lib/format"

import { ProjectSettingsSheet } from "./project-settings-sheet"
import {
  publishBlockedReason,
  PublishDialog,
  type PublishingState,
} from "./publish-dialog"

const QUALITY_LABELS: Record<RenderQuality, string> = {
  draft: "Draft",
  standard: "Standard",
  high: "High",
}

export type ClipRender = {
  url: string
  downloadUrl: string
  createdAt: Date
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
}

type RenderJob = { status: string; progress: number }

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

function timeAgo(from: Date, now: number) {
  const minutes = Math.floor((now - from.getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

function outputState({
  clipStatus,
  render,
  renderJob,
  outdated,
}: {
  clipStatus: ClipStatus
  render?: ClipRender
  renderJob?: RenderJob
  outdated: boolean
}): { tone: Tone; lit?: boolean; label: string } {
  if (clipStatus === "rendering") {
    return {
      tone: "lav",
      label:
        renderJob?.status === "running"
          ? `Rendering ${Math.round(renderJob.progress)}%`
          : "Queued to render",
    }
  }
  if (clipStatus === "failed") return { tone: "pink", label: "Render failed" }
  if (outdated)
    return { tone: "amber", lit: true, label: "Edited since last render" }
  if (clipStatus === "rendered" && render)
    return { tone: "mint", label: "Rendered" }
  return { tone: "neutral", label: "Not rendered" }
}

export function ClipExportMenu({
  clip,
  render,
  renderJob,
  outdated,
  busy,
  durationMs,
  quality,
  onRender,
  publishing,
  settingsData,
}: {
  clip: React.ComponentProps<typeof PublishDialog>["clip"] & {
    error: string | null
  }
  render?: ClipRender
  renderJob?: RenderJob
  outdated: boolean
  busy: boolean
  durationMs: number
  quality: RenderQuality
  onRender: () => void
  publishing: PublishingState
  settingsData: ProjectSettingsData
}) {
  const router = useRouter()
  const [retrying, startRetry] = React.useTransition()
  const [openedAt, setOpenedAt] = React.useState(0)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [watchOpen, setWatchOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsUsed, setSettingsUsed] = React.useState(false)
  const rendering = clip.status === "rendering"
  const state = outputState({
    clipStatus: clip.status,
    render,
    renderJob,
    outdated,
  })
  const publication = publishing.publications[clip.id]
  const shown =
    publication && publication.status !== "removed" ? publication : undefined
  const publishedLive = shown?.status === "published" && Boolean(shown.url)
  const editedSincePublish =
    shown !== undefined && shown.renderAssetId !== clip.renderAssetId
  const canPublishAgain =
    !shown ||
    (!ACTIVE_PUBLICATION_STATUSES.has(shown.status) &&
      (shown.status !== "published" || editedSincePublish))
  const blocked = publishBlockedReason(clip, publishing)
  const uploading =
    shown !== undefined &&
    shown.status !== "waiting_quota" &&
    ACTIVE_PUBLICATION_STATUSES.has(shown.status)
  const uploadLabel = `Publishing…${shown?.progress === undefined ? "" : ` ${shown.progress}%`}`
  const status = (
    <span
      data-testid="clip-status"
      role="status"
      className="flex items-center gap-[7px] text-[12.5px] whitespace-nowrap text-muted-foreground"
    >
      <SignalDot tone={state.tone} lit={state.lit} className="size-[7px]" />
      <span className="max-[1099px]:sr-only">{state.label}</span>
    </span>
  )

  return (
    <div className="flex items-center gap-2.5 ps-1">
      {clip.status === "failed" && clip.error ? (
        <Tooltip>
          <TooltipTrigger render={status} />
          <TooltipContent side="bottom" className="break-words">
            {clip.error}
          </TooltipContent>
        </Tooltip>
      ) : (
        status
      )}
      {uploading && (
        <span
          role="status"
          className="text-[12.5px] whitespace-nowrap text-muted-foreground max-[1099px]:sr-only"
        >
          {uploadLabel}
        </span>
      )}
      <div className="inline-flex rounded-full shadow-primary transition-[transform,box-shadow] duration-[250ms,300ms] ease-snappy hover:-translate-y-px hover:shadow-primary-hover has-disabled:opacity-45 has-disabled:hover:translate-y-0">
        <Button
          variant="primary"
          disabled={busy || rendering}
          onClick={onRender}
          className="rounded-e-none pe-3 shadow-none hover:translate-y-0 hover:shadow-none disabled:opacity-100"
        >
          <PlayIcon data-icon="inline-start" aria-hidden />
          {render ? "Re-render" : "Render"}
        </Button>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) setOpenedAt(Date.now())
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                variant="primary"
                aria-label="More export options"
                className="rounded-s-none px-2.5 shadow-[inset_1px_0_0_rgb(0_0_0/0.15)] hover:translate-y-0 hover:shadow-[inset_1px_0_0_rgb(0_0_0/0.15)]"
              />
            }
          >
            <CaretDownIcon aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={10}
            className="w-[280px]"
          >
            <div className="grid gap-0.5 px-2.5 pt-2 pb-2.5">
              <b className="text-[13px] font-semibold text-foreground">
                {render
                  ? `Last render · ${timeAgo(render.createdAt, openedAt)}`
                  : "Not rendered yet"}
              </b>
              <span className="text-xs text-tertiary">
                {render
                  ? [
                      `${render.width ?? 1080}×${render.height ?? 1920}`,
                      render.durationMs !== null && seconds(render.durationMs),
                      QUALITY_LABELS[quality],
                      formatBytes(render.bytes),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `1080×1920 · ${seconds(durationMs)} · ${QUALITY_LABELS[quality]}`}
              </span>
              {clip.status === "failed" && clip.error && (
                <span className="text-xs break-words text-pink">
                  {clip.error}
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
            {render && (
              <DropdownMenuItem onClick={() => setWatchOpen(true)}>
                <MonitorPlayIcon aria-hidden />
                Watch last render
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!render}
              render={<a href={render?.downloadUrl} download />}
            >
              <DownloadSimpleIcon aria-hidden />
              Download last render
            </DropdownMenuItem>
            {publishedLive && (
              <DropdownMenuItem
                render={
                  <a href={shown!.url!} target="_blank" rel="noreferrer" />
                }
              >
                <ArrowSquareOutIcon aria-hidden />
                Published on YouTube
                <span className="sr-only"> (opens in a new tab)</span>
                <Kbd className="ms-auto text-mint">Live</Kbd>
              </DropdownMenuItem>
            )}
            {uploading && (
              <DropdownMenuItem disabled>
                <UploadSimpleIcon aria-hidden />
                {uploadLabel}
              </DropdownMenuItem>
            )}
            {shown?.status === "waiting_quota" && (
              <DropdownMenuItem disabled>
                <UploadSimpleIcon aria-hidden />
                Waiting for YouTube&apos;s daily limit
              </DropdownMenuItem>
            )}
            {shown?.status === "failed" && (
              <DropdownMenuItem
                disabled={retrying}
                onClick={() =>
                  startRetry(async () => {
                    const result = await retryPublicationAction(shown.id)
                    if (!result.ok) {
                      toast.error(result.error.message)
                      return
                    }
                    router.refresh()
                  })
                }
              >
                <ArrowsClockwiseIcon aria-hidden />
                <span className="grid gap-0.5">
                  <span className="text-pink">Publish failed · Retry</span>
                  {shown.error && (
                    <span className="text-xs break-words text-tertiary">
                      {shown.error}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            )}
            {canPublishAgain && (
              <DropdownMenuItem
                disabled={Boolean(blocked)}
                onClick={() => setPublishOpen(true)}
              >
                <UploadSimpleIcon aria-hidden />
                <span className="grid gap-0.5">
                  {shown?.status === "published"
                    ? "Publish again…"
                    : "Publish to YouTube…"}
                  {(blocked ||
                    (shown?.status === "published" && editedSincePublish)) && (
                    <span className="text-xs text-tertiary">
                      {blocked ?? "Edited since publish"}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                setSettingsUsed(true)
                setSettingsOpen(true)
              }}
            >
              <SlidersHorizontalIcon aria-hidden />
              Render quality: {QUALITY_LABELS[quality]}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PublishDialog
        clip={clip}
        publishing={publishing}
        previous={shown?.metadata}
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />
      {settingsUsed && (
        <ProjectSettingsSheet
          data={settingsData}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      {render && (
        <Dialog open={watchOpen} onOpenChange={setWatchOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Last render</DialogTitle>
              <DialogDescription>
                The file that downloads and publishes.
              </DialogDescription>
            </DialogHeader>
            <video
              key={render.url}
              src={render.url}
              controls
              autoPlay
              preload="metadata"
              aria-label="Rendered clip"
              className="mx-auto aspect-[9/16] max-h-[70dvh] rounded-2xl bg-black"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
