"use client"

import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  CropRegion,
  CropRegionEditor,
} from "@/components/ui/crop-region-editor"
import { Kbd } from "@/components/ui/kbd"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useVideoPlayer,
  VideoPlayerProvider,
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
import {
  planClipEffectsAction,
  setClipStatusAction,
  updateClipAction,
} from "@/features/clips/actions"
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
import { classifyAspect } from "@/features/pipeline/steps/probe-parse"
import type {
  ProjectSettingsData,
  SourceLoudness,
} from "@/features/projects/queries"
import type { ProjectSettings } from "@/features/projects/schema"
import { renderClipsAction } from "@/features/render/actions"
import { captionBlocks } from "@/features/timeline/captions"
import type { Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ClipEffectsPreview } from "./clip-effects"
import { ClipExportMenu, type ClipRender } from "./clip-export-menu"
import {
  CaptionsPanel,
  ClipInspector,
  DetailsPanel,
  EffectsPanel,
  LayoutPanel,
  type InspectorTab,
} from "./clip-inspector"
import { ClipTimeline, type TimelineSelection } from "./clip-timeline"
import { ClipPlayback, ClipTransport, useClipTransport } from "./clip-transport"
import { IconAction } from "./icon-action"
import { DEFAULT_WEBCAM, GameplayRegion, withLayoutMode } from "./layout-fields"
import { MusicPreview } from "./music-preview"
import type { PublishingState } from "./publish-dialog"
import { initialClipEdit, useClipEdit } from "./use-clip-edit"
import { useClipHotkeys } from "./use-clip-hotkeys"
import { useClipStatus } from "./use-clip-status"
import { useProjectEvents } from "./use-project-events"

const AUTOSAVE_MS = 600
const MUSIC_POLL_MS = 3000
const DEFAULT_FPS = 30
const WIDE_QUERY = "(min-width: 1180px)"
const PANE_HEIGHT = "min(100cqh - 32px, 452px)"
const BADGE =
  "pointer-events-none absolute rounded-[7px] bg-night/72 px-[7px] py-[5px] text-[11px] leading-none font-semibold whitespace-nowrap backdrop-blur-sm"
const HATCH =
  "bg-[repeating-linear-gradient(135deg,rgb(255_143_192/0.22)_0_6px,transparent_6px_12px)]"

type ClipEditorProps = {
  projectId: string
  projectName: string
  clip: Clip
  src: string
  sourceDurationMs: number
  sourceWidth: number
  sourceHeight: number
  fps: number | null
  words: Word[]
  settings: ProjectSettings
  settingsData: ProjectSettingsData
  installedFonts: readonly CaptionFontId[]
  render?: ClipRender
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

function subscribeWide(notify: () => void) {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}

function useWide() {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true
  )
}

export function ClipEditor(props: ClipEditorProps) {
  return (
    <VideoPlayerProvider>
      <Editor {...props} />
    </VideoPlayerProvider>
  )
}

function Editor({
  projectId,
  projectName,
  clip,
  src,
  sourceDurationMs,
  sourceWidth,
  sourceHeight,
  fps,
  words,
  settings,
  settingsData,
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
  const { currentMs } = useVideoPlayer()
  const [pending, startTransition] = React.useTransition()
  const [planning, startPlanning] = React.useTransition()
  const { edit, patch, undo, redo } = useClipEdit(() =>
    initialClipEdit(clip, settings)
  )
  const {
    startMs,
    endMs,
    title,
    hook,
    styleRef,
    captionsOverride,
    layout,
    effects,
    audioMix,
    textOverlays,
    captions,
  } = edit
  const captionsEnabled = captionsOverride ?? settings.captionsEnabled
  const [detecting, setDetecting] = React.useState(() =>
    needsWebcam(clip.layout)
  )
  const [cropBase, setCropBase] = React.useState(clip.layout)
  const hasWebcam = usesWebcam(layout.mode)
  const [previewUnavailable, setPreviewUnavailable] = React.useState(false)
  const [selection, setSelection] = React.useState<TimelineSelection | null>(
    null
  )
  const [tab, setTab] = React.useState<InspectorTab>("details")
  const [drawer, setDrawer] = React.useState(false)
  const [loop, setLoop] = React.useState(true)
  const [safeZones, setSafeZones] = React.useState(false)
  const wide = useWide()
  const inspectorRef = React.useRef<HTMLDivElement>(null)
  const safeId = React.useId()
  const selectedEffect = selection?.type === "effect" ? selection.index : null
  const transport = useClipTransport(startMs, endMs)

  const select = (next: TimelineSelection | null) => {
    setSelection(next)
    if (next?.type === "effect") setTab("effects")
  }
  React.useEffect(() => {
    if (selectedEffect === null || tab !== "effects") return
    inspectorRef.current
      ?.querySelector(`[data-effect-card="${selectedEffect}"]`)
      ?.scrollIntoView?.({ block: "nearest" })
  }, [selectedEffect, tab])

  const editLayout = (next: Partial<LayoutInput>) =>
    patch((current) => ({ layout: { ...current.layout, ...next } }))
  const layoutRef = React.useRef(layout)
  React.useEffect(() => {
    layoutRef.current = layout
  })
  const findWebcam = React.useCallback(
    (range: { startMs: number; endMs: number }, signal?: AbortSignal) =>
      detectWebcam(src, { range, signal }).then(
        (result) => {
          const found = withDetection(
            layoutRef.current,
            result,
            sourceWidth,
            sourceHeight
          )
          patch(
            (current) => ({
              layout: withDetection(
                current.layout,
                result,
                sourceWidth,
                sourceHeight
              ),
            }),
            "rebase"
          )
          setCropBase(found)
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
    [src, sourceWidth, sourceHeight, patch]
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

  const cropChanged =
    JSON.stringify([
      layout.webcamRect,
      layout.gameplayRect,
      layout.gameplayFocusX,
    ]) !==
    JSON.stringify([
      cropBase.webcamRect,
      cropBase.gameplayRect,
      cropBase.gameplayFocusX,
    ])
  const resetCrop = () =>
    editLayout({
      webcamRect: cropBase.webcamRect,
      gameplayRect: cropBase.gameplayRect,
      gameplayFocusX: cropBase.gameplayFocusX,
      ...(cropBase.mode === layout.mode
        ? {}
        : withLayoutMode(cropBase, layout.mode, sourceWidth, sourceHeight)),
    })

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
  const overrides = Object.entries(captions.pageEdits).map(
    ([index, value]) => ({
      index: Number(index),
      ...value,
    })
  )
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
  const spokenPages = lanes[0]!.pages
  const blocks = captionBlocks(spokenPages, captions)

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
    setSelection(null)
    patch((current) => ({
      startMs: start,
      endMs: end,
      captions: {
        ...current.captions,
        pageEdits: {},
        added: captionsInClip(current.captions.added, length),
        lanes: current.captions.lanes.map((lane) => ({
          ...lane,
          captions: captionsInClip(lane.captions, length),
        })),
      },
      textOverlays: overlaysInClip(current.textOverlays, length),
      audioMix: musicInClip(current.audioMix, length),
    }))
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
  const unsaved = React.useRef(false)
  React.useEffect(() => {
    latest.current = payload
    unsaved.current = dirty && !rendering
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
      patch({ effects: stored }, "skip")
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
  }, [projectId, clip.id, patch])

  React.useEffect(() => {
    if (!dirty || rendering) return
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [serialized, dirty, rendering, persist])

  React.useEffect(
    () => () => {
      if (unsaved.current)
        void updateClipAction(projectId, clip.id, latest.current)
    },
    [projectId, clip.id]
  )

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

  const planEffects = () =>
    startPlanning(async () => {
      const planned = await planClipEffectsAction(projectId, clip.id, {
        startMs,
        endMs,
        layout,
      })
      if (!planned.ok) {
        toast.error(planned.error.message)
        return
      }
      setSelection(null)
      patch({ effects: planned.value })
    })

  const saveState = saveError
    ? "Failed"
    : saving || (dirty && !rendering)
      ? "Saving…"
      : dirty
        ? "Unsaved"
        : "Saved"

  const approved = ["approved", "rendering", "rendered"].includes(clipStatus)
  const rejected = clipStatus === "rejected"
  const locked = status.pending || rendering || clipStatus === "rendered"
  const decide = (next: "approved" | "rejected") => {
    if (locked) return
    status.setStatus(
      (next === "approved" ? approved : rejected) ? "candidate" : next
    )
  }
  const busy = pending || rendering
  const clipsHref = `/projects/${projectId}/clips` as const
  const clipHref = (id: string) => `/projects/${projectId}/clips/${id}` as Route
  const frameMs = 1000 / (fps && fps > 0 ? fps : DEFAULT_FPS)
  const aspect = classifyAspect(sourceWidth, sourceHeight)
  const ratio = sourceWidth / sourceHeight

  const travel = (id: string | null) => {
    if (id) router.push(clipHref(id))
  }
  const timeTravel = (step: () => void) => {
    if (busy) return
    setSelection(null)
    step()
  }
  useClipHotkeys({
    " ": transport.toggle,
    arrowleft: () => transport.step(-frameMs),
    arrowright: () => transport.step(frameMs),
    "shift+arrowleft": () => transport.step(-1000),
    "shift+arrowright": () => transport.step(1000),
    a: () => decide("approved"),
    x: () => decide("rejected"),
    "[": () => travel(siblings.previousId),
    "]": () => travel(siblings.nextId),
    "mod+z": () => timeTravel(undo),
    "mod+shift+z": () => timeTravel(redo),
  })

  const inspector = (
    <div ref={inspectorRef} className="flex min-h-0 flex-1 flex-col">
      <ClipInspector tab={tab} onTabChange={setTab}>
        <DetailsPanel
          title={title}
          onTitleChange={(next) => patch({ title: next })}
          hook={hook}
          onHookChange={(next) => patch({ hook: next })}
          score={clip.score}
          reason={clip.reason}
          publication={publishing.publications[clip.id]}
        />
        <CaptionsPanel
          style={style}
          styleRef={styleRef}
          onStyleRefChange={(next) => patch({ styleRef: next })}
          installedFonts={installedFonts}
          enabled={captionsEnabled}
          onEnabledChange={(checked) => {
            if (selection?.type === "caption") setSelection(null)
            patch({
              captionsOverride:
                checked === settings.captionsEnabled ? undefined : checked,
            })
          }}
          captions={captions}
          onCaptionsChange={(next) => {
            if (
              selection?.type === "caption" &&
              Object.keys(captions.pageEdits).length > 0 &&
              Object.keys(next.pageEdits).length === 0
            )
              setSelection(null)
            patch({ captions: next })
          }}
          blocks={blocks}
          playheadMs={currentMs - startMs}
          disabled={busy}
        />
        <LayoutPanel
          layout={layout}
          hasWebcam={hasWebcam}
          detecting={detecting}
          onFindWebcam={() => {
            setDetecting(true)
            void findWebcam({ startMs, endMs })
          }}
          onModeChange={(mode) =>
            editLayout(withLayoutMode(layout, mode, sourceWidth, sourceHeight))
          }
          onCamPositionChange={(camPosition) => editLayout({ camPosition })}
        />
        <EffectsPanel
          effects={effects}
          clipStartMs={startMs}
          hasWebcam={hasWebcam && Boolean(layout.webcamRect)}
          selected={selectedEffect}
          onSelect={(index) =>
            setSelection(index === null ? null : { type: "effect", index })
          }
          onEffectsChange={(next) => patch({ effects: next })}
          onPlan={planEffects}
          planning={planning}
          disabled={busy}
        />
      </ClipInspector>
    </div>
  )

  return (
    <>
      <ClipPlayback startMs={startMs} endMs={endMs} loop={loop} />
      <MusicPreview
        voices={voices}
        clipStartMs={startMs}
        sourceDb={audioPlan ? audioPlan.sourceDb : 0}
        onUnavailable={() => setPreviewUnavailable(true)}
      />
      <div data-slot="clip-editor" className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-3 ps-2.5 pe-4 shadow-[inset_0_-1px_0_var(--hair)]">
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={clipsHref}
                  aria-label="Back to clips"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                />
              }
            >
              <ArrowLeftIcon aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to clips</TooltipContent>
          </Tooltip>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-xs text-tertiary">
              {projectName}
              {siblings.index >= 0 &&
                ` · Clip ${siblings.index + 1} of ${siblings.count}`}{" "}
              ·{" "}
              <span className="font-mono tabular-nums">
                {formatTimestamp(startMs)} → {formatTimestamp(endMs)}
              </span>
            </span>
            <div className="flex min-w-0 items-baseline gap-1.5">
              <h1 className="truncate text-base leading-tight font-semibold tracking-[-0.02em]">
                {title || clip.title}
              </h1>
              <span className="flex shrink-0 gap-1 text-xs text-tertiary">
                <span aria-hidden>·</span>
                <span
                  data-testid="save-state"
                  role="status"
                  title={saveError ?? undefined}
                  className={saveError ? "text-pink" : undefined}
                >
                  {saveState}
                  {saveError && <span className="sr-only">: {saveError}</span>}
                </span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <SiblingLink
              href={siblings.previousId ? clipHref(siblings.previousId) : null}
              label="Previous clip"
              shortcut="["
            >
              <CaretLeftIcon aria-hidden />
            </SiblingLink>
            {siblings.index >= 0 && (
              <span className="min-w-11 text-center font-mono text-[13px] text-muted-foreground tabular-nums">
                {siblings.index + 1} / {siblings.count}
              </span>
            )}
            <SiblingLink
              href={siblings.nextId ? clipHref(siblings.nextId) : null}
              label="Next clip"
              shortcut="]"
            >
              <CaretRightIcon aria-hidden />
            </SiblingLink>
          </div>
          <span aria-hidden className="h-6 w-px shrink-0 bg-hair" />
          <Segmented
            aria-label="Review decision"
            className="shrink-0"
            value={approved ? ["approved"] : rejected ? ["rejected"] : []}
            disabled={locked}
            onValueChange={(next) =>
              status.setStatus(
                next[0] === "approved" || next[0] === "rejected"
                  ? next[0]
                  : "candidate"
              )
            }
          >
            <SegmentedItem
              value="rejected"
              className="aria-pressed:bg-pink/14 aria-pressed:text-pink aria-pressed:inset-ring-pink/40"
            >
              <XIcon aria-hidden />
              {rejected ? "Rejected" : "Reject"}
            </SegmentedItem>
            <SegmentedItem
              value="approved"
              className="aria-pressed:bg-mint/18 aria-pressed:text-mint aria-pressed:inset-ring-mint/50"
            >
              <CheckIcon aria-hidden />
              {approved ? "Approved" : "Approve"}
            </SegmentedItem>
          </Segmented>
          <ClipExportMenu
            clip={{ ...clip, status: clipStatus, audioMix }}
            render={render}
            renderJob={renderJob}
            outdated={Boolean(render) && (dirty || clipStatus !== "rendered")}
            busy={pending}
            durationMs={durationMs}
            quality={settings.renderQuality}
            onRender={renderNow}
            publishing={publishing}
            settingsData={settingsData}
          />
          {!wide && (
            <IconAction
              label="Clip settings"
              side="bottom"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <SidebarSimpleIcon mirrored aria-hidden />
            </IconAction>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <section
            aria-label="Preview"
            className="flex min-w-0 flex-1 flex-col gap-3 px-[18px] pt-4 pb-3"
          >
            <div className="[container-type:size] flex min-h-0 flex-1 justify-center gap-4">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-6 w-full items-center gap-2.5">
                  <span className="mono-label whitespace-nowrap text-tertiary">
                    Source{aspect === "other" ? "" : ` · ${aspect}`}
                  </span>
                  <span className="flex-1" />
                  {hasWebcam && (
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                      <i className="size-2.5 rounded-[3px] inset-ring-2 inset-ring-lav" />
                      Webcam
                    </span>
                  )}
                  {layout.mode !== "no-cam-blur-fill" && (
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                      <i className="size-2.5 rounded-[3px] outline-[1.5px] -outline-offset-[1.5px] outline-white/60 outline-dashed" />
                      Gameplay
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="ms-1 h-auto px-0 text-[12.5px]"
                    disabled={detecting || !cropChanged}
                    onClick={resetCrop}
                  >
                    Reset crop
                  </Button>
                </div>
                <div
                  className="flex w-full items-center justify-center"
                  style={{ height: PANE_HEIGHT }}
                >
                  <CropRegionEditor
                    value={layout.webcamRect ?? DEFAULT_WEBCAM}
                    onValueChange={(webcamRect) => editLayout({ webcamRect })}
                    disabled={detecting}
                    className="overflow-hidden rounded-[14px] bg-black"
                    style={{
                      aspectRatio: `${sourceWidth} / ${sourceHeight}`,
                      width: `min(100%, ${PANE_HEIGHT} * ${ratio})`,
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
                    >
                      <span className={cn(BADGE, "top-2 left-2")}>
                        Gameplay
                      </span>
                    </GameplayRegion>
                    {hasWebcam && (
                      <CropRegion aria-label="Webcam region" variant="ring">
                        <span className={cn(BADGE, "top-2 left-2 text-lav")}>
                          Webcam
                        </span>
                      </CropRegion>
                    )}
                  </CropRegionEditor>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="flex h-6 w-full items-center gap-3">
                  <span className="mono-label whitespace-nowrap text-tertiary">
                    Output · 9:16
                  </span>
                  <span className="flex-1" />
                  <label
                    htmlFor={safeId}
                    className="cursor-pointer text-xs whitespace-nowrap text-muted-foreground"
                  >
                    Safe zones
                  </label>
                  <Switch
                    id={safeId}
                    size="sm"
                    checked={safeZones}
                    onCheckedChange={setSafeZones}
                  />
                </div>
                <ClipEffectsPreview
                  layout={output}
                  source={{ width: sourceWidth, height: sourceHeight }}
                  effects={effects}
                  selected={selectedEffect}
                  onEffectsChange={(next) => patch({ effects: next })}
                  lanes={lanes}
                  startMs={startMs}
                  captionStyle={style}
                  captionsEnabled={captionsEnabled}
                  overlays={textOverlays}
                  className="mx-0 aspect-[9/16] w-auto max-w-none rounded-[18px] shadow-[0_30px_70px_-30px_rgb(0_0_0/0.9)]"
                  previewClassName="size-full rounded-[18px] inset-ring-1 inset-ring-white/10"
                  style={{ height: PANE_HEIGHT }}
                  onBaselineChange={(lane, next) => {
                    if (lane === 0) {
                      patch((current) => ({
                        styleRef: placeCaption(current.styleRef, next),
                      }))
                      return
                    }
                    patch((current) => ({
                      captions: {
                        ...current.captions,
                        lanes: current.captions.lanes.map((item, i) =>
                          i === lane - 1 ? { ...item, baseline: next } : item
                        ),
                      },
                    }))
                  }}
                >
                  {safeZones && (
                    <div
                      aria-hidden
                      data-testid="safe-zones"
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[18px]"
                    >
                      <span
                        className={cn(
                          HATCH,
                          "absolute inset-x-0 bottom-0 h-[22%] shadow-[inset_0_1px_0_rgb(255_143_192/0.7)]"
                        )}
                      />
                      <span
                        className={cn(
                          HATCH,
                          "absolute top-[40%] right-0 bottom-[22%] w-[16%] shadow-[inset_1px_0_0_rgb(255_143_192/0.7)]"
                        )}
                      />
                      <span className={cn(BADGE, "bottom-2 left-2 text-pink")}>
                        Covered by Shorts UI
                      </span>
                    </div>
                  )}
                </ClipEffectsPreview>
              </div>
            </div>
            <ClipTransport
              startMs={startMs}
              endMs={endMs}
              loop={loop}
              onLoopChange={setLoop}
            />
          </section>

          {wide ? (
            <aside
              aria-label="Clip settings"
              className="flex w-[340px] shrink-0 flex-col shadow-[inset_1px_0_0_var(--hair)]"
            >
              {inspector}
            </aside>
          ) : (
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetContent
                side="right"
                className="w-[340px] max-w-full gap-0 bg-night pt-10 data-[side=right]:sm:max-w-[340px]"
              >
                <SheetTitle className="sr-only">Clip settings</SheetTitle>
                {inspector}
              </SheetContent>
            </Sheet>
          )}
        </div>

        <ClipTimeline
          src={src}
          sourceDurationMs={sourceDurationMs}
          startMs={startMs}
          endMs={endMs}
          onTrim={trim}
          hasWebcam={hasWebcam && Boolean(layout.webcamRect)}
          effects={effects}
          onEffectsChange={(next) => patch({ effects: next })}
          spokenPages={spokenPages}
          captions={captions}
          onCaptionsChange={(next) => patch({ captions: next })}
          captionsEnabled={captionsEnabled}
          onCaptionsEnabledChange={(checked) =>
            patch({
              captionsOverride:
                checked === settings.captionsEnabled ? undefined : checked,
            })
          }
          captionBaseline={baseline}
          textOverlays={textOverlays}
          onTextOverlaysChange={(next) => patch({ textOverlays: next })}
          hook={hook}
          title={title}
          captionsNearTop={captionsNearTop}
          audioMix={audioMix ?? DEFAULT_AUDIO_MIX}
          onAudioMixChange={(next) => patch({ audioMix: next })}
          tracks={musicTracks}
          trending={trendingMusic}
          loudness={loudness}
          previewUnavailable={previewUnavailable}
          selection={selection}
          onSelectionChange={select}
          disabled={busy}
        />
      </div>
    </>
  )
}

function SiblingLink({
  href,
  label,
  shortcut,
  children,
}: {
  href: Route | null
  label: string
  shortcut: string
  children: React.ReactNode
}) {
  if (!href) {
    return (
      <Button size="icon-sm" variant="ghost" aria-label={label} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
