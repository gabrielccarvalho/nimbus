"use client"

import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  MagicWandIcon,
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
import { Spinner } from "@/components/ui/spinner"
import { StatusPill } from "@/components/ui/status-pill"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import { overlaysInClip } from "@/features/captions/overlay"
import {
  buildCaptionPages,
  captionLanes,
  captionsInClip,
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
import { detectWebcam } from "@/features/layout/detect-webcam"
import { withDetection } from "@/features/layout/geometry"
import {
  needsWebcam,
  renderableLayout,
  usesWebcam,
  type LayoutInput,
} from "@/features/layout/schema"
import { planAudio } from "@/features/music/envelope"
import {
  DEFAULT_AUDIO_MIX,
  musicInClip,
  type MusicTrackSummary,
  type TrendingMusic,
} from "@/features/music/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { SourceLoudness } from "@/features/projects/queries"
import type { ProjectSettings } from "@/features/projects/schema"
import type { CaptionState } from "@/features/timeline/captions"
import { renderClipsAction } from "@/features/render/actions"
import type { Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"

import { CaptionStyleFields } from "./caption-style-fields"
import { ClipEffectsPreview } from "./clip-effects"
import { useClipStatus } from "./clip-player-dialog"
import { ClipLoop } from "./clip-preview"
import { ClipTimeline, type TimelineSelection } from "./clip-timeline"
import { MusicPreview } from "./music-preview"
import { PublishControl, type PublishingState } from "./publish-dialog"
import { useProjectEvents } from "./use-project-events"
import {
  CamPositionField,
  DEFAULT_WEBCAM,
  GameplayRegion,
  LayoutModeOptions,
  withLayoutMode,
} from "./layout-fields"

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
  loudness: SourceLoudness | null
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

export function ClipEditor({
  projectId,
  clip,
  src,
  sourceDurationMs,
  sourceWidth,
  sourceHeight,
  words,
  settings,
  installedFonts,
  render,
  snapshot: initialSnapshot,
  publishing,
  siblings,
  musicTracks,
  trendingMusic,
  loudness,
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
  const [layout, setLayout] = React.useState(clip.layout)
  const [detecting, setDetecting] = React.useState(() =>
    needsWebcam(clip.layout)
  )
  const hasWebcam = usesWebcam(layout.mode)
  const [effects, setEffects] = React.useState(clip.effects)
  const [audioMix, setAudioMix] = React.useState(clip.audioMix)
  const [textOverlays, setTextOverlays] = React.useState(clip.textOverlays)
  const [previewUnavailable, setPreviewUnavailable] = React.useState(false)
  const [selection, setSelection] = React.useState<TimelineSelection | null>(
    null
  )
  const selectedEffect = selection?.type === "effect" ? selection.index : null
  const editLayout = (patch: Partial<LayoutInput>) =>
    setLayout((current) => ({ ...current, ...patch }))
  const findWebcam = React.useCallback(
    (range: { startMs: number; endMs: number }, signal?: AbortSignal) =>
      detectWebcam(src, { range, signal }).then(
        (result) => {
          setLayout((current) =>
            withDetection(current, result, sourceWidth, sourceHeight)
          )
          setDetecting(false)
          if (usesWebcam(result.mode)) {
            toast.success(
              `Webcam found (${Math.round(result.confidence * 100)}% confident)`
            )
          } else {
            toast.info("No webcam found. Mark it yourself if there is one.")
          }
        },
        (error: unknown) => {
          if (signal?.aborted) return
          setDetecting(false)
          toast.error(
            error instanceof Error ? error.message : "Webcam detection failed"
          )
        }
      ),
    [src, sourceWidth, sourceHeight]
  )
  const [autoDetect] = React.useState(() => needsWebcam(clip.layout))
  React.useEffect(() => {
    if (!autoDetect) return
    const controller = new AbortController()
    void findWebcam(
      { startMs: clip.startMs, endMs: clip.endMs },
      controller.signal
    )
    return () => controller.abort()
  }, [autoDetect, findWebcam, clip.startMs, clip.endMs])
  const [captions, setCaptions] = React.useState<CaptionState>(() => ({
    pageEdits: Object.fromEntries(
      (clip.captionOverrides?.pages ?? []).map(({ index, ...edit }) => [
        index,
        edit,
      ])
    ),
    offsetMs: clip.captionOverrides?.offsetMs ?? 0,
    added: clip.captionOverrides?.added ?? [],
    lanes: clip.captionOverrides?.lanes ?? [],
  }))

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
  const readyTracks = React.useMemo(
    () =>
      new Map(
        musicTracks.flatMap((track) =>
          track.status === "ready" ? [[track.id, track] as const] : []
        )
      ),
    [musicTracks]
  )
  const musicProcessing = musicTracks.some((t) => t.status === "processing")

  React.useEffect(() => {
    if (!musicProcessing) return
    const timer = setInterval(() => router.refresh(), MUSIC_POLL_MS)
    return () => clearInterval(timer)
  }, [musicProcessing, router])
  const audioPlan = React.useMemo(
    () => planAudio(audioMix, readyTracks, durationMs, clipWords),
    [audioMix, readyTracks, durationMs, clipWords]
  )
  const voices = (audioPlan?.music ?? []).flatMap((plan, index) => {
    const track = readyTracks.get(plan.trackId)
    return track
      ? [{ key: `${index}:${plan.trackId}`, src: track.url, plan }]
      : []
  })
  const output = renderableLayout(layout)
  const baseline = captionBaseline(style, output)
  const captionsNearTop = captionsEnabled && baseline < 0.4
  const overrides = Object.entries(captions.pageEdits).map(([index, edit]) => ({
    index: Number(index),
    ...edit,
  }))
  const lanes = captionLanes(
    basePages,
    {
      pages: overrides,
      offsetMs: captions.offsetMs,
      added: captions.added,
      lanes: captions.lanes,
    },
    durationMs,
    null,
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
    const length = end - start
    setStartMs(start)
    setEndMs(end)
    setSelection(null)
    setCaptions((current) => ({
      ...current,
      pageEdits: {},
      added: captionsInClip(current.added, length),
      lanes: current.lanes.map((lane) => ({
        ...lane,
        captions: captionsInClip(lane.captions, length),
      })),
    }))
    setTextOverlays((current) => overlaysInClip(current, length))
    setAudioMix((current) => musicInClip(current, length))
  }

  const payload = {
    startMs,
    endMs,
    title,
    hook,
    captionOverrides: {
      enabled: captionsOverride,
      offsetMs: captions.offsetMs || undefined,
      pages: overrides,
      added: captions.added,
      lanes: captions.lanes,
      style: styleRef,
    },
    layout,
    effects,
    audioMix,
    textOverlays,
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
      setSelection((current) => {
        if (current?.type !== "effect") return current
        const effect = snapshot.effects?.events[current.index]
        if (!effect || !stored) return null
        const found = stored.events.findIndex(
          (event) =>
            event.kind === effect.kind &&
            event.startMs === effect.startMs &&
            (event.lane ?? 0) === (effect.lane ?? 0)
        )
        return found === -1 ? null : { type: "effect", index: found }
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
        voices={voices}
        clipStartMs={startMs}
        sourceDb={audioPlan ? audioPlan.sourceDb : 0}
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
                disabled={detecting}
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
          </div>

          <aside className="grid min-w-0 flex-[1_1_340px] gap-4">
            <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3.5">
              <ClipEffectsPreview
                layout={output}
                source={{ width: sourceWidth, height: sourceHeight }}
                effects={effects}
                selected={selectedEffect}
                onEffectsChange={setEffects}
                lanes={lanes}
                startMs={startMs}
                captionStyle={style}
                captionsEnabled={captionsEnabled}
                overlays={textOverlays}
                onBaselineChange={(lane, next) => {
                  if (lane === 0) {
                    setStyleRef((current) => placeCaption(current, next))
                    return
                  }
                  setCaptions((current) => ({
                    ...current,
                    lanes: current.lanes.map((edit, i) =>
                      i === lane - 1 ? { ...edit, baseline: next } : edit
                    ),
                  }))
                }}
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
                className="grid w-full grid-cols-3"
              >
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="captions">Captions</TabsTrigger>
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
                  <p
                    className="min-w-0 flex-1 text-[13px] text-tertiary"
                    aria-live="polite"
                  >
                    {detecting
                      ? "Looking for the webcam in this clip…"
                      : hasWebcam
                        ? "Drag the solid box over the webcam, the dashed one over the gameplay."
                        : layout.mode === "no-cam-fill"
                          ? "The dashed box is the part of the frame that fills the short."
                          : "The whole frame is shown over a blurred copy of itself."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={detecting}
                    onClick={() => {
                      setDetecting(true)
                      void findWebcam({ startMs, endMs })
                    }}
                  >
                    {detecting ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <MagicWandIcon data-icon="inline-start" aria-hidden />
                    )}
                    Find webcam
                  </Button>
                </div>
                <LayoutModeOptions
                  value={layout.mode}
                  disabled={detecting}
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
                    Captions are off for this clip. Turn them on with the eye on
                    the captions track.
                  </p>
                )}
                <CaptionStyleFields
                  value={styleRef}
                  onValueChange={setStyleRef}
                  installedFonts={installedFonts}
                  disabled={!captionsEnabled}
                />
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        <ClipTimeline
          projectId={projectId}
          clipId={clip.id}
          sourceDurationMs={sourceDurationMs}
          startMs={startMs}
          endMs={endMs}
          onTrim={trim}
          layout={layout}
          hasWebcam={hasWebcam && Boolean(layout.webcamRect)}
          effects={effects}
          onEffectsChange={setEffects}
          spokenPages={lanes[0]!.pages}
          captions={captions}
          onCaptionsChange={setCaptions}
          captionsEnabled={captionsEnabled}
          onCaptionsEnabledChange={(checked) =>
            setCaptionsOverride(
              checked === settings.captionsEnabled ? undefined : checked
            )
          }
          captionBaseline={baseline}
          textOverlays={textOverlays}
          onTextOverlaysChange={setTextOverlays}
          hook={hook}
          title={title}
          captionsNearTop={captionsNearTop}
          audioMix={audioMix ?? DEFAULT_AUDIO_MIX}
          onAudioMixChange={setAudioMix}
          tracks={musicTracks}
          trending={trendingMusic}
          loudness={loudness}
          previewUnavailable={previewUnavailable}
          selection={selection}
          onSelectionChange={setSelection}
          disabled={pending || rendering}
        />
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
