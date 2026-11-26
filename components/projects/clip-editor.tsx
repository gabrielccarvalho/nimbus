"use client"

import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  CropRegion,
  CropRegionEditor,
} from "@/components/ui/crop-region-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { StatusPill } from "@/components/ui/status-pill"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Timeline,
  TimelinePlayhead,
  TimelineRange,
} from "@/components/ui/timeline"
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
  buildCaptionPages,
  editCaptionPages,
  wordsInRange,
} from "@/features/captions/pages"
import {
  captionBaseline,
  placeCaption,
  resolveCaptionStyle,
  type CaptionFontId,
} from "@/features/captions/styles"
import { setClipStatusAction, updateClipAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import { usesWebcam, type LayoutInput } from "@/features/layout/schema"
import { planAudio } from "@/features/music/envelope"
import type { MusicTrackSummary, TrendingMusic } from "@/features/music/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { ProjectSettings } from "@/features/projects/schema"
import { renderClipsAction } from "@/features/render/actions"
import type { Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"

import { AudioTextPanel } from "./audio-text-panel"
import { CaptionStyleFields } from "./caption-style-fields"
import { ClipCaptionsCard, type PageEdits } from "./clip-captions"
import { ClipEffectsCard, ClipEffectsPreview } from "./clip-effects"
import { useClipStatus } from "./clip-player-dialog"
import { ClipLoop } from "./clip-preview"
import { MusicPreview } from "./music-preview"
import { PublishControl, type PublishingState } from "./publish-dialog"
import { useProjectEvents } from "./use-project-events"
import {
  CamPositionField,
  DEFAULT_WEBCAM,
  GameplayRegion,
  LayoutModeOptions,
  withLayoutMode,
} from "./layout-editor"

const WINDOW_PADDING_MS = 10_000
const AUTOSAVE_MS = 600
const MUSIC_POLL_MS = 3000
const QUALITY_LABELS = { draft: "Draft", standard: "Standard", high: "High" }

type ClipEditorProps = {
  projectId: string
  clip: Clip
  src: string
  sourceDurationMs: number
  sourceWidth: number
  sourceHeight: number
  layout: LayoutInput
  words: Word[]
  settings: ProjectSettings
  installedFonts: readonly CaptionFontId[]
  render?: { url: string; downloadUrl: string }
  snapshot: ProjectSnapshot
  publishing: PublishingState
  siblings: {
    index: number
    count: number
    previousId: string | null
    nextId: string | null
  }
  musicTracks: MusicTrackSummary[]
  trendingMusic: Promise<TrendingMusic>
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

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
      <Button type="button" size="sm" onClick={() => onStart(currentMs)}>
        Start at playhead
      </Button>
      <Button type="button" size="sm" onClick={() => onEnd(currentMs)}>
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
  sourceWidth,
  sourceHeight,
  layout: projectLayout,
  words,
  settings,
  installedFonts,
  render,
  snapshot: initialSnapshot,
  publishing,
  siblings,
  musicTracks,
  trendingMusic,
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
  const [captionsOverride, setCaptionsOverride] = React.useState(
    clip.captionOverrides?.enabled
  )
  const captionsEnabled = captionsOverride ?? settings.captionsEnabled
  const [layoutOverride, setLayoutOverride] =
    React.useState<LayoutInput | null>(clip.layoutOverride)
  const layout = layoutOverride ?? projectLayout
  const hasWebcam = usesWebcam(layout.mode)
  const [effects, setEffects] = React.useState(clip.effects)
  const [audioMix, setAudioMix] = React.useState(clip.audioMix)
  const [textOverlay, setTextOverlay] = React.useState(clip.textOverlay)
  const [previewUnavailable, setPreviewUnavailable] = React.useState(false)
  const [selectedEffect, setSelectedEffect] = React.useState<number | null>(
    null
  )
  const editLayout = (patch: Partial<LayoutInput>) =>
    setLayoutOverride((current) => ({
      ...(current ?? projectLayout),
      ...patch,
    }))
  const [pageEdits, setPageEdits] = React.useState<PageEdits>(() =>
    Object.fromEntries(
      (clip.captionOverrides?.pages ?? []).map(({ index, ...edit }) => [
        index,
        edit,
      ])
    )
  )
  const [offsetMs, setOffsetMs] = React.useState(
    clip.captionOverrides?.offsetMs ?? 0
  )

  const windowStartMs = Math.max(0, clip.startMs - WINDOW_PADDING_MS)
  const windowEndMs = Math.min(sourceDurationMs, clip.endMs + WINDOW_PADDING_MS)
  const style = resolveCaptionStyle(styleRef)
  const durationMs = endMs - startMs
  const clipWords = React.useMemo(
    () => wordsInRange(words, startMs, endMs),
    [words, startMs, endMs]
  )
  const basePages = React.useMemo(
    () =>
      buildCaptionPages(clipWords, durationMs, {
        maxWordsPerPage: style.maxWordsPerPage,
        maxCharsPerLine: style.maxCharsPerLine,
      }),
    [clipWords, durationMs, style.maxWordsPerPage, style.maxCharsPerLine]
  )
  const selectedTrack = musicTracks.find((t) => t.id === audioMix?.trackId)
  const track = selectedTrack?.status === "ready" ? selectedTrack : null
  const musicProcessing = musicTracks.some((t) => t.status === "processing")

  React.useEffect(() => {
    if (!musicProcessing) return
    const timer = setInterval(() => router.refresh(), MUSIC_POLL_MS)
    return () => clearInterval(timer)
  }, [musicProcessing, router])
  const audioPlan = React.useMemo(
    () => planAudio(audioMix, track, durationMs, clipWords),
    [audioMix, track, durationMs, clipWords]
  )
  const captionsNearTop =
    captionsEnabled && captionBaseline(style, layout) < 0.4
  const overrides = Object.entries(pageEdits).map(([index, edit]) => ({
    index: Number(index),
    ...edit,
  }))
  const pages = editCaptionPages(
    basePages,
    { pages: overrides, offsetMs },
    durationMs,
    { maxCharsPerLine: style.maxCharsPerLine, maxLines: 2 }
  )

  const clipStatus =
    snapshot.clips.find((c) => c.id === clip.id)?.status ?? clip.status
  const renderJob = snapshot.jobs.find(
    (job) =>
      job.type === "render_clip" &&
      job.clipId === clip.id &&
      (job.status === "running" || job.status === "queued")
  )
  const rendering = clipStatus === "rendering"
  const status = useClipStatus(projectId, {
    ...clip,
    status: clipStatus,
  })

  const trim = (nextStart: number, nextEnd: number) => {
    const start = Math.max(0, Math.min(Math.round(nextStart), sourceDurationMs))
    const end = Math.max(0, Math.min(Math.round(nextEnd), sourceDurationMs))
    setStartMs(start)
    setEndMs(end)
    setPageEdits({})
  }

  const payload = {
    startMs,
    endMs,
    title,
    hook,
    captionOverrides: {
      enabled: captionsOverride,
      offsetMs: offsetMs || undefined,
      pages: overrides,
      style: styleRef,
    },
    layoutOverride,
    effects,
    audioMix,
    textOverlay,
  }
  const serialized = JSON.stringify(payload)
  const [saved, setSaved] = React.useState(serialized)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const dirty = serialized !== saved
  const latest = React.useRef(payload)
  React.useEffect(() => {
    latest.current = payload
  })

  const persist = React.useCallback(async () => {
    const snapshot = latest.current
    const text = JSON.stringify(snapshot)
    setSaving(true)
    const result = await updateClipAction(projectId, clip.id, snapshot)
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.error.message)
      return false
    }
    setSaveError(null)
    const stored = result.value.effects
    const untouched =
      JSON.stringify(latest.current.effects) ===
      JSON.stringify(snapshot.effects)
    if (
      untouched &&
      JSON.stringify(stored) !== JSON.stringify(snapshot.effects)
    ) {
      setEffects(stored)
      setSelectedEffect((index) => {
        const effect =
          index === null ? undefined : snapshot.effects?.events[index]
        if (!effect || !stored) return null
        const found = stored.events.findIndex(
          (event) => JSON.stringify(event) === JSON.stringify(effect)
        )
        return found === -1 ? null : found
      })
      setSaved(JSON.stringify({ ...snapshot, effects: stored }))
    } else {
      setSaved(text)
    }
    return true
  }, [projectId, clip.id])

  React.useEffect(() => {
    if (!dirty || rendering) return
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [serialized, dirty, rendering, persist])

  const renderNow = () =>
    startTransition(async () => {
      if (dirty && !(await persist())) return
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

  const saveState = saveError
    ? `Not saved: ${saveError}`
    : saving
      ? "Saving…"
      : dirty
        ? "Unsaved changes"
        : "Saved"

  const approved = ["approved", "rendering", "rendered"].includes(clipStatus)
  const statusLabel =
    clipStatus === "rendered"
      ? "Up to date"
      : clipStatus === "rendering"
        ? "Rendering"
        : clipStatus === "failed"
          ? "Failed"
          : render
            ? "Out of date"
            : "Not rendered"
  const clipsHref = `/projects/${projectId}/clips` as const

  return (
    <VideoPlayerProvider>
      <ClipLoop startMs={startMs} endMs={endMs} />
      <MusicPreview
        src={track?.url ?? null}
        plan={audioPlan?.music ?? null}
        trackStartMs={audioMix?.trackStartMs ?? 0}
        clipStartMs={startMs}
        sourceDb={audioPlan?.sourceDb ?? 0}
        onUnavailable={() => setPreviewUnavailable(true)}
      />
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={clipsHref}
            aria-label="Back to all clips"
            className={buttonVariants({ size: "icon" })}
          >
            <ArrowLeftIcon aria-hidden />
          </Link>
          <div className="grid min-w-0 flex-[1_1_300px] gap-0.5">
            <h2 className="truncate text-[21px] font-semibold tracking-[-0.03em]">
              {title || clip.title}
            </h2>
            <span className="text-[13px] text-tertiary">
              {siblings.index >= 0 &&
                `Clip ${siblings.index + 1} of ${siblings.count} · `}
              <span className="font-mono tabular-nums">
                {formatTimestamp(startMs)} → {formatTimestamp(endMs)}
              </span>{" "}
              ·{" "}
              <span
                data-testid="save-state"
                role="status"
                className={saveError ? "text-pink" : undefined}
              >
                {saveState}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <SiblingLink
              projectId={projectId}
              clipId={siblings.previousId}
              label="Previous clip"
            >
              <CaretLeftIcon aria-hidden />
            </SiblingLink>
            {siblings.index >= 0 && (
              <span className="px-1 font-mono text-[13px] text-muted-foreground tabular-nums">
                {siblings.index + 1} / {siblings.count}
              </span>
            )}
            <SiblingLink
              projectId={projectId}
              clipId={siblings.nextId}
              label="Next clip"
            >
              <CaretRightIcon aria-hidden />
            </SiblingLink>
          </div>
          <Button
            size="sm"
            aria-pressed={clipStatus === "rejected"}
            disabled={status.pending || rendering || clipStatus === "rendered"}
            onClick={() =>
              status.setStatus(
                clipStatus === "rejected" ? "candidate" : "rejected"
              )
            }
          >
            <XIcon data-icon="inline-start" aria-hidden />
            {clipStatus === "rejected" ? "Rejected" : "Reject"}
          </Button>
          <Button
            size="sm"
            variant={approved ? "primary" : "default"}
            aria-pressed={approved}
            disabled={status.pending || rendering || clipStatus === "rendered"}
            onClick={() =>
              status.setStatus(approved ? "candidate" : "approved")
            }
          >
            <CheckIcon data-icon="inline-start" aria-hidden />
            {approved ? "Approved" : "Approve"}
          </Button>
        </div>

        <div className="flex flex-wrap items-start gap-[22px]">
          <div className="grid min-w-0 flex-[999_1_560px] gap-4">
            <div className="overflow-hidden rounded-[18px] bg-black">
              <CropRegionEditor
                value={layout.webcamRect ?? DEFAULT_WEBCAM}
                onValueChange={(webcamRect) => editLayout({ webcamRect })}
                className="mx-auto w-full rounded-none"
                style={{
                  aspectRatio: `${sourceWidth} / ${sourceHeight}`,
                  maxWidth: `calc(46vh * ${sourceWidth / sourceHeight})`,
                }}
              >
                <VideoPlayerVideo
                  src={src}
                  aria-label="Source video"
                  className="size-full"
                />
                <GameplayRegion
                  layout={layout}
                  width={sourceWidth}
                  height={sourceHeight}
                  onLayoutChange={editLayout}
                />
                {hasWebcam && <CropRegion aria-label="Webcam region" />}
              </CropRegionEditor>
              <VideoPlayerControls>
                <VideoPlayerPlayButton />
                <VideoPlayerTime />
                <VideoPlayerMuteButton className="ms-auto" />
              </VideoPlayerControls>
            </div>

            <section className="grid gap-3.5 rounded-[18px] bg-graphite px-[18px] py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold tracking-[-0.015em]">
                  Trim
                </h3>
                <span className="text-[13px] text-tertiary">
                  {seconds(durationMs)} s long. Changing the trim resets caption
                  edits.
                </span>
              </div>
              <TrimTimeline
                windowStartMs={windowStartMs}
                windowEndMs={windowEndMs}
                startMs={startMs}
                endMs={endMs}
              />
              <div className="flex flex-wrap items-end gap-3 pt-3.5 shadow-[inset_0_1px_0_var(--hair)]">
                <div className="grid flex-[1_1_140px] gap-2">
                  <Label htmlFor="clip-start">Start (seconds)</Label>
                  <Input
                    id="clip-start"
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0}
                    className="font-mono"
                    value={seconds(startMs)}
                    onChange={(event) =>
                      trim(Number(event.target.value) * 1000, endMs)
                    }
                  />
                </div>
                <div className="grid flex-[1_1_140px] gap-2">
                  <Label htmlFor="clip-end">End (seconds)</Label>
                  <Input
                    id="clip-end"
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0}
                    className="font-mono"
                    value={seconds(endMs)}
                    onChange={(event) =>
                      trim(startMs, Number(event.target.value) * 1000)
                    }
                  />
                </div>
                <PlayheadButtons
                  onStart={(ms) => trim(ms, endMs)}
                  onEnd={(ms) => trim(startMs, ms)}
                />
              </div>
            </section>

            <ClipEffectsCard
              projectId={projectId}
              clipId={clip.id}
              startMs={startMs}
              endMs={endMs}
              layoutOverride={layoutOverride}
              hasWebcam={hasWebcam && Boolean(layout.webcamRect)}
              effects={effects}
              onEffectsChange={setEffects}
              selected={selectedEffect}
              onSelectedChange={setSelectedEffect}
              disabled={pending || rendering}
            />

            <ClipCaptionsCard
              startMs={startMs}
              durationMs={durationMs}
              basePages={basePages}
              pages={pages}
              enabled={captionsEnabled}
              onEnabledChange={(checked) =>
                setCaptionsOverride(
                  checked === settings.captionsEnabled ? undefined : checked
                )
              }
              pageEdits={pageEdits}
              onPageEditsChange={setPageEdits}
              offsetMs={offsetMs}
              onOffsetChange={setOffsetMs}
              disabled={pending || rendering}
            />
          </div>

          <aside className="grid min-w-0 flex-[1_1_340px] gap-4">
            <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3.5">
              <ClipEffectsPreview
                layout={layout}
                source={{ width: sourceWidth, height: sourceHeight }}
                effects={effects}
                selected={selectedEffect}
                onEffectsChange={setEffects}
                pages={pages}
                startMs={startMs}
                captionStyle={style}
                captionsEnabled={captionsEnabled}
                overlay={textOverlay}
                onBaselineChange={(baseline) =>
                  setStyleRef((current) => placeCaption(current, baseline))
                }
              />
              <div className="grid content-start justify-items-start gap-2.5">
                <span className="mono-label">Output</span>
                <span className="text-[13px] text-muted-foreground">
                  1080×1920 · {seconds(durationMs)} s
                  {settings.renderQuality &&
                    ` · ${QUALITY_LABELS[settings.renderQuality]}`}
                </span>
                <StatusPill
                  tone={
                    clipStatus === "rendered"
                      ? "mint"
                      : clipStatus === "failed"
                        ? "pink"
                        : clipStatus === "rendering"
                          ? "lav"
                          : render
                            ? "amber"
                            : "neutral"
                  }
                  data-testid="clip-status"
                >
                  {statusLabel}
                </StatusPill>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-1.5"
                  disabled={pending || rendering}
                  onClick={renderNow}
                >
                  <FilmSlateIcon data-icon="inline-start" aria-hidden />
                  Render this clip
                </Button>
                {rendering && (
                  <Progress
                    value={
                      renderJob?.status === "running"
                        ? renderJob.progress
                        : null
                    }
                    aria-live="polite"
                    className="w-full"
                  >
                    <ProgressLabel>
                      {renderJob?.status === "running" ? "Rendering" : "Queued"}
                    </ProgressLabel>
                    <ProgressValue />
                  </Progress>
                )}
                {clipStatus === "failed" && clip.error && (
                  <p className="text-sm break-words text-pink">{clip.error}</p>
                )}
                {render && !rendering && (
                  <a
                    href={render.downloadUrl}
                    download
                    className={buttonVariants({ size: "sm" })}
                  >
                    <DownloadSimpleIcon data-icon="inline-start" aria-hidden />
                    Download
                  </a>
                )}
                {render && !rendering && (
                  <PublishControl
                    clip={{ ...clip, status: clipStatus, audioMix }}
                    publishing={publishing}
                    live
                  />
                )}
              </div>
            </div>
            {render && !rendering && (
              <video
                key={render.url}
                src={render.url}
                controls
                preload="metadata"
                aria-label="Rendered clip"
                className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded-2xl bg-black"
              />
            )}

            <Tabs
              defaultValue="details"
              className="gap-4 rounded-[18px] bg-graphite px-[18px] py-4"
            >
              <TabsList
                aria-label="Clip inspector"
                className="grid w-full grid-cols-[repeat(4,auto)] justify-between"
              >
                <TabsTrigger value="details" className="px-2.5 text-[13px]">
                  Details
                </TabsTrigger>
                <TabsTrigger value="layout" className="px-2.5 text-[13px]">
                  Layout
                </TabsTrigger>
                <TabsTrigger value="captions" className="px-2.5 text-[13px]">
                  Captions
                </TabsTrigger>
                <TabsTrigger value="audio" className="px-2.5 text-[13px]">
                  Audio &amp; text
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="clip-title">Title</Label>
                  <Input
                    id="clip-title"
                    value={title}
                    maxLength={100}
                    required
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <p className="text-[13px] text-tertiary">
                    Used for the file name and the export manifest.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="clip-hook">Hook</Label>
                  <Textarea
                    id="clip-hook"
                    value={hook}
                    maxLength={200}
                    onChange={(event) => setHook(event.target.value)}
                    className="min-h-16"
                  />
                </div>
              </TabsContent>
              <TabsContent value="layout" className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px] text-tertiary">
                    {layoutOverride
                      ? "This clip has its own layout."
                      : "Uses the project layout. Changes here apply to this clip only."}
                  </p>
                  {layoutOverride && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLayoutOverride(null)}
                    >
                      <ArrowCounterClockwiseIcon
                        data-icon="inline-start"
                        aria-hidden
                      />
                      Use project layout
                    </Button>
                  )}
                </div>
                <LayoutModeOptions
                  value={layout.mode}
                  onValueChange={(mode) =>
                    editLayout(
                      withLayoutMode(layout, mode, sourceWidth, sourceHeight)
                    )
                  }
                />
                {hasWebcam && (
                  <CamPositionField
                    value={layout.camPosition ?? "top"}
                    onValueChange={(camPosition) => editLayout({ camPosition })}
                  />
                )}
              </TabsContent>
              <TabsContent value="captions" className="grid gap-4">
                {!captionsEnabled && (
                  <p className="text-[13px] text-tertiary">
                    Captions are off for this clip. Turn them on in the Captions
                    panel under the video.
                  </p>
                )}
                <CaptionStyleFields
                  value={styleRef}
                  onValueChange={setStyleRef}
                  installedFonts={installedFonts}
                  disabled={!captionsEnabled}
                />
              </TabsContent>
              <TabsContent value="audio">
                <AudioTextPanel
                  audioMix={audioMix}
                  onAudioMixChange={setAudioMix}
                  textOverlay={textOverlay}
                  onTextOverlayChange={setTextOverlay}
                  tracks={musicTracks}
                  trending={trendingMusic}
                  clipDurationMs={durationMs}
                  hook={hook}
                  title={title}
                  captionsNearTop={captionsNearTop}
                  previewUnavailable={previewUnavailable}
                  disabled={pending || rendering}
                />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>
    </VideoPlayerProvider>
  )
}

function SiblingLink({
  projectId,
  clipId,
  label,
  children,
}: {
  projectId: string
  clipId: string | null
  label: string
  children: React.ReactNode
}) {
  if (!clipId) {
    return (
      <Button size="icon-sm" variant="ghost" aria-label={label} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Link
      href={`/projects/${projectId}/clips/${clipId}`}
      aria-label={label}
      className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
    >
      {children}
    </Link>
  )
}
