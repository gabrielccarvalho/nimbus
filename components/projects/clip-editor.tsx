"use client"

import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  CaptionPreview,
  CaptionPreviewText,
} from "@/components/ui/caption-preview"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  Timeline,
  TimelinePlayhead,
  TimelineRange,
} from "@/components/ui/timeline"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  useVideoPlayer,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import {
  applyPageOverrides,
  buildCaptionPages,
  wordsInRange,
  type CaptionPage,
} from "@/features/captions/pages"
import {
  CAPTION_PRESETS,
  captionBaseline,
  cssCaptionStyle,
  resolveCaptionStyle,
} from "@/features/captions/styles"
import { setClipStatusAction, updateClipAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { ProjectSettings } from "@/features/projects/schema"
import { renderClipsAction } from "@/features/render/actions"
import type { Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"

import { useProjectEvents } from "./use-project-events"
import { VerticalPreviewCanvas } from "./vertical-preview"

const WINDOW_PADDING_MS = 10_000

type ClipEditorProps = {
  projectId: string
  clip: Clip
  src: string
  sourceDurationMs: number
  layout: LayoutInput
  words: Word[]
  settings: ProjectSettings
  render?: { url: string; downloadUrl: string }
  snapshot: ProjectSnapshot
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

function ClipLoop({ startMs, endMs }: { startMs: number; endMs: number }) {
  const { currentMs, paused, seek } = useVideoPlayer()
  React.useEffect(() => {
    if (currentMs < startMs - 250 || currentMs >= endMs) seek(startMs)
  }, [currentMs, paused, startMs, endMs, seek])
  return null
}

function TrimTimeline({
  windowStartMs,
  windowEndMs,
  startMs,
  endMs,
}: {
  windowStartMs: number
  windowEndMs: number
  startMs: number
  endMs: number
}) {
  const { currentMs, seek } = useVideoPlayer()
  return (
    <Timeline
      aria-label="Clip timeline"
      durationMs={windowEndMs - windowStartMs}
      value={Math.max(0, currentMs - windowStartMs)}
      onValueChange={(ms) => seek(ms + windowStartMs)}
      step={100}
      className="h-10"
    >
      <TimelineRange
        variant="selected"
        startMs={startMs - windowStartMs}
        endMs={endMs - windowStartMs}
      />
      <TimelinePlayhead />
    </Timeline>
  )
}

function ClipPreview({
  layout,
  pages,
  startMs,
  captionStyle,
  captionsEnabled,
}: {
  layout: LayoutInput
  pages: CaptionPage[]
  startMs: number
  captionStyle: ReturnType<typeof resolveCaptionStyle>
  captionsEnabled: boolean
}) {
  const { currentMs } = useVideoPlayer()
  return (
    <CaptionPreview
      role="img"
      aria-label="Vertical preview with captions"
      className="mx-auto max-w-[260px]"
    >
      <VerticalPreviewCanvas
        layout={layout}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      {captionsEnabled && (
        <CaptionPreviewText
          pages={pages}
          currentMs={currentMs - startMs}
          captionStyle={cssCaptionStyle(captionStyle)}
          baseline={captionBaseline(captionStyle, layout.mode)}
        />
      )}
    </CaptionPreview>
  )
}

function PlayheadButtons({
  onStart,
  onEnd,
}: {
  onStart: (ms: number) => void
  onEnd: (ms: number) => void
}) {
  const { currentMs } = useVideoPlayer()
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onStart(currentMs)}
      >
        Start at playhead
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onEnd(currentMs)}
      >
        End at playhead
      </Button>
    </div>
  )
}

export function ClipEditor({
  projectId,
  clip,
  src,
  sourceDurationMs,
  layout,
  words,
  settings,
  render,
  snapshot: initialSnapshot,
}: ClipEditorProps) {
  const router = useRouter()
  const snapshot = useProjectEvents(initialSnapshot)
  const [pending, startTransition] = React.useTransition()
  const [startMs, setStartMs] = React.useState(clip.startMs)
  const [endMs, setEndMs] = React.useState(clip.endMs)
  const [title, setTitle] = React.useState(clip.title)
  const [hook, setHook] = React.useState(clip.hook)
  const [styleRef, setStyleRef] = React.useState(
    clip.captionOverrides?.style ?? settings.captionStyle
  )
  const [pageTexts, setPageTexts] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(
      (clip.captionOverrides?.pages ?? []).map((p) => [p.index, p.text])
    )
  )

  const windowStartMs = Math.max(0, clip.startMs - WINDOW_PADDING_MS)
  const windowEndMs = Math.min(sourceDurationMs, clip.endMs + WINDOW_PADDING_MS)
  const style = resolveCaptionStyle(styleRef)
  const durationMs = endMs - startMs
  const basePages = React.useMemo(
    () =>
      buildCaptionPages(wordsInRange(words, startMs, endMs), durationMs, {
        maxWordsPerPage: style.maxWordsPerPage,
        maxCharsPerLine: style.maxCharsPerLine,
      }),
    [
      words,
      startMs,
      endMs,
      durationMs,
      style.maxWordsPerPage,
      style.maxCharsPerLine,
    ]
  )
  const overrides = Object.entries(pageTexts).map(([index, text]) => ({
    index: Number(index),
    text,
  }))
  const pages = applyPageOverrides(basePages, overrides, {
    maxCharsPerLine: style.maxCharsPerLine,
    maxLines: 2,
  })

  const clipStatus =
    snapshot.clips.find((c) => c.id === clip.id)?.status ?? clip.status
  const renderJob = snapshot.jobs.find(
    (job) =>
      job.clipId === clip.id &&
      (job.status === "running" || job.status === "queued")
  )
  const rendering = clipStatus === "rendering"

  const trim = (nextStart: number, nextEnd: number) => {
    const start = Math.max(0, Math.min(Math.round(nextStart), sourceDurationMs))
    const end = Math.max(0, Math.min(Math.round(nextEnd), sourceDurationMs))
    setStartMs(start)
    setEndMs(end)
    setPageTexts({})
  }

  const save = (thenRender: boolean) =>
    startTransition(async () => {
      const saved = await updateClipAction(projectId, clip.id, {
        startMs,
        endMs,
        title,
        hook,
        captionOverrides: { pages: overrides, style: styleRef },
      })
      if (!saved.ok) {
        toast.error(saved.error.message)
        return
      }
      if (!thenRender) {
        toast.success("Clip saved")
        router.refresh()
        return
      }
      if (clipStatus === "candidate" || clipStatus === "rejected") {
        const approved = await setClipStatusAction(
          projectId,
          clip.id,
          "approved"
        )
        if (!approved.ok) {
          toast.error(approved.error.message)
          return
        }
      }
      const rendered = await renderClipsAction(projectId, [clip.id])
      if (!rendered.ok) toast.error(rendered.error.message)
      else toast.success("Rendering started")
      router.refresh()
    })

  return (
    <VideoPlayerProvider>
      <ClipLoop startMs={startMs} endMs={endMs} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-xl bg-black">
            <VideoPlayerVideo
              src={src}
              aria-label="Source video"
              className="max-h-[40vh]"
            />
            <VideoPlayerControls>
              <VideoPlayerPlayButton />
              <VideoPlayerTime />
              <VideoPlayerMuteButton className="ms-auto" />
            </VideoPlayerControls>
          </div>
          <TrimTimeline
            windowStartMs={windowStartMs}
            windowEndMs={windowEndMs}
            startMs={startMs}
            endMs={endMs}
          />

          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              save(false)
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Trim</CardTitle>
                <CardDescription>
                  {seconds(durationMs)} s long. Editing the trim resets caption
                  text edits.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="clip-start">Start (seconds)</Label>
                    <Input
                      id="clip-start"
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      min={0}
                      value={seconds(startMs)}
                      onChange={(event) =>
                        trim(Number(event.target.value) * 1000, endMs)
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="clip-end">End (seconds)</Label>
                    <Input
                      id="clip-end"
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      min={0}
                      value={seconds(endMs)}
                      onChange={(event) =>
                        trim(startMs, Number(event.target.value) * 1000)
                      }
                    />
                  </div>
                </div>
                <PlayheadButtons
                  onStart={(ms) => trim(ms, endMs)}
                  onEnd={(ms) => trim(startMs, ms)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Title and hook</CardTitle>
                <CardDescription>
                  Used for the file name and the export manifest.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clip-title">Title</Label>
                  <Input
                    id="clip-title"
                    value={title}
                    maxLength={100}
                    required
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clip-hook">Hook</Label>
                  <Textarea
                    id="clip-hook"
                    value={hook}
                    maxLength={200}
                    onChange={(event) => setHook(event.target.value)}
                    className="min-h-16"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Captions</CardTitle>
                <CardDescription>
                  {settings.captionsEnabled
                    ? "Fix transcription mistakes per caption. Each caption keeps its timing."
                    : "Captions are turned off for this project in Settings."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label id="caption-style-label">Style</Label>
                  <ToggleGroup
                    aria-labelledby="caption-style-label"
                    variant="outline"
                    size="sm"
                    value={[style.id]}
                    onValueChange={(value) => {
                      if (value[0])
                        setStyleRef({ presetId: value[0], overrides: {} })
                    }}
                  >
                    {CAPTION_PRESETS.map((preset) => (
                      <ToggleGroupItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <ol aria-label="Caption text" className="flex flex-col gap-2">
                  {basePages.map((page) => {
                    const id = `caption-${page.index}`
                    const original = page.words.map((w) => w.text).join(" ")
                    const edited = pageTexts[page.index] !== undefined
                    return (
                      <li key={page.index} className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1">
                          <Label
                            htmlFor={id}
                            className="font-mono text-xs text-muted-foreground tabular-nums"
                          >
                            Caption {page.index + 1} ·{" "}
                            {formatTimestamp(page.startMs)}
                          </Label>
                          <Input
                            id={id}
                            value={pageTexts[page.index] ?? original}
                            maxLength={200}
                            onChange={(event) =>
                              setPageTexts((current) => ({
                                ...current,
                                [page.index]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        {edited && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Reset caption ${page.index + 1}`}
                            onClick={() =>
                              setPageTexts((current) => {
                                const next = { ...current }
                                delete next[page.index]
                                return next
                              })
                            }
                          >
                            <ArrowCounterClockwiseIcon aria-hidden />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                  {basePages.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No speech in this clip.
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || rendering}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || rendering}
                onClick={() => save(true)}
              >
                <FilmSlateIcon data-icon="inline-start" aria-hidden />
                Save and render
              </Button>
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-4">
          <ClipPreview
            layout={layout}
            pages={pages}
            startMs={startMs}
            captionStyle={style}
            captionsEnabled={settings.captionsEnabled}
          />
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Render
                <Badge variant="secondary" data-testid="clip-status">
                  {clipStatus === "rendered"
                    ? "Up to date"
                    : clipStatus === "rendering"
                      ? "Rendering"
                      : clipStatus === "failed"
                        ? "Failed"
                        : render
                          ? "Out of date"
                          : "Not rendered"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {rendering && (
                <Progress
                  value={
                    renderJob?.status === "running" ? renderJob.progress : null
                  }
                  aria-live="polite"
                >
                  <ProgressLabel>
                    {renderJob?.status === "running" ? "Rendering" : "Queued"}
                  </ProgressLabel>
                  <ProgressValue />
                </Progress>
              )}
              {clipStatus === "failed" && clip.error && (
                <p className="text-sm break-words text-destructive">
                  {clip.error}
                </p>
              )}
              {render && !rendering && (
                <>
                  <video
                    key={render.url}
                    src={render.url}
                    controls
                    preload="metadata"
                    aria-label="Rendered clip"
                    className="aspect-[9/16] w-full rounded-lg bg-black"
                  />
                  <a
                    href={render.downloadUrl}
                    download
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <DownloadSimpleIcon data-icon="inline-start" aria-hidden />
                    Download
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </VideoPlayerProvider>
  )
}
