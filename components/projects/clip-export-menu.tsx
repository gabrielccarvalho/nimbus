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
import { useLocale } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"

import { review } from "./messages/review"
import { ProjectSettingsSheet } from "./project-settings-sheet"
import {
  publishBlockedReason,
  PublishDialog,
  type PublishingState,
} from "./publish-dialog"

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

type Messages = (typeof review)["en-US"]["exportMenu"]

function timeAgo(from: Date, now: number, t: Messages) {
  const minutes = Math.floor((now - from.getTime()) / 60_000)
  if (minutes < 1) return t.justNow
  if (minutes < 60) return t.minutesAgo(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t.hoursAgo(hours)
  return t.daysAgo(Math.floor(hours / 24))
}

function outputState({
  clipStatus,
  render,
  renderJob,
  outdated,
  t,
}: {
  clipStatus: ClipStatus
  render?: ClipRender
  renderJob?: RenderJob
  outdated: boolean
  t: Messages
}): { tone: Tone; lit?: boolean; label: string } {
  if (clipStatus === "rendering") {
    return {
      tone: "lav",
      label:
        renderJob?.status === "running"
          ? t.rendering(Math.round(renderJob.progress))
          : t.queued,
    }
  }
  if (clipStatus === "failed") return { tone: "pink", label: t.failed }
  if (outdated) return { tone: "amber", lit: true, label: t.outdated }
  if (clipStatus === "rendered" && render)
    return { tone: "mint", label: t.rendered }
  return { tone: "neutral", label: t.notRendered }
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
  const locale = useLocale()
  const t = review[locale].exportMenu
  const publicationText = review[locale].publication
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
    t,
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
  const blocked = publishBlockedReason(clip, publishing, locale)
  const uploading =
    shown !== undefined &&
    shown.status !== "waiting_quota" &&
    ACTIVE_PUBLICATION_STATUSES.has(shown.status)
  const uploadLabel = publicationText.publishing(shown?.progress)
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
            {translateError(clip.error, locale)}
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
          {render ? t.rerender : t.render}
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
                aria-label={t.more}
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
                  ? t.lastRender(timeAgo(render.createdAt, openedAt, t))
                  : t.notRenderedYet}
              </b>
              <span className="text-xs text-tertiary">
                {render
                  ? [
                      `${render.width ?? 1080}×${render.height ?? 1920}`,
                      render.durationMs !== null &&
                        t.seconds(render.durationMs / 1000),
                      t.quality[quality],
                      formatBytes(render.bytes, locale),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `1080×1920 · ${t.seconds(durationMs / 1000)} · ${t.quality[quality]}`}
              </span>
              {clip.status === "failed" && clip.error && (
                <span className="text-xs break-words text-pink">
                  {translateError(clip.error, locale)}
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
            {render && (
              <DropdownMenuItem onClick={() => setWatchOpen(true)}>
                <MonitorPlayIcon aria-hidden />
                {t.watch}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!render}
              render={<a href={render?.downloadUrl} download />}
            >
              <DownloadSimpleIcon aria-hidden />
              {t.download}
            </DropdownMenuItem>
            {publishedLive && (
              <DropdownMenuItem
                render={
                  <a href={shown!.url!} target="_blank" rel="noreferrer" />
                }
              >
                <ArrowSquareOutIcon aria-hidden />
                {t.published}
                <span className="sr-only"> {publicationText.newTab}</span>
                <Kbd className="ms-auto text-mint">{t.live}</Kbd>
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
                {publicationText.waitingQuota}
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
                  <span className="text-pink">{t.publishFailedRetry}</span>
                  {shown.error && (
                    <span className="text-xs break-words text-tertiary">
                      {translateError(shown.error, locale)}
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
                  {shown?.status === "published" ? t.publishAgain : t.publish}
                  {(blocked ||
                    (shown?.status === "published" && editedSincePublish)) && (
                    <span className="text-xs text-tertiary">
                      {blocked ?? t.editedSincePublish}
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
              {t.renderQuality(t.quality[quality])}
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
              <DialogTitle>{t.watchTitle}</DialogTitle>
              <DialogDescription>{t.watchDescription}</DialogDescription>
            </DialogHeader>
            <video
              key={render.url}
              src={render.url}
              controls
              autoPlay
              preload="metadata"
              aria-label={t.video}
              className="mx-auto aspect-[9/16] max-h-[70dvh] rounded-2xl bg-black"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
