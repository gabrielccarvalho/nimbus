"use client"

import { MagicWandIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  CaptionPreview,
  CaptionPreviewText,
} from "@/components/ui/caption-preview"
import {
  CropRegion,
  CropRegionEditor,
} from "@/components/ui/crop-region-editor"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  VideoPlayerControls,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
  useVideoPlayer,
} from "@/components/ui/video-player"
import { buildCaptionPages, type CaptionWord } from "@/features/captions/pages"
import {
  captionBaseline,
  cssCaptionStyle,
  resolveCaptionStyle,
  type CaptionFontId,
} from "@/features/captions/styles"
import { confirmLayoutAction } from "@/features/layout/actions"
import {
  detectWebcam,
  type WebcamDetection,
} from "@/features/layout/detect-webcam"
import {
  gameplayBox,
  gameplaySlotAspect,
  refitGameplay,
} from "@/features/layout/geometry"
import {
  camPositionSchema,
  layoutModeSchema,
  type CamPosition,
  usesWebcam,
  type LayoutInput,
  type LayoutMode,
  type Rect,
} from "@/features/layout/schema"
import { updateProjectSettingsAction } from "@/features/projects/actions"
import type { ProjectSettings } from "@/features/projects/schema"
import { formatDuration } from "@/lib/format"

import {
  CaptionStyleFields,
  type CaptionStyleRef,
} from "./caption-style-fields"
import { VerticalPreviewCanvas } from "./vertical-preview"

export const LAYOUT_MODES: {
  value: LayoutMode
  label: string
  description: string
}[] = [
  {
    value: "cam-top",
    label: "Webcam on top",
    description: "A webcam strip, gameplay below",
  },
  {
    value: "split-50",
    label: "Even split",
    description: "Webcam and gameplay, half each",
  },
  {
    value: "no-cam-fill",
    label: "Fill, no webcam",
    description: "Gameplay cropped to fill the frame",
  },
  {
    value: "no-cam-blur-fill",
    label: "Fit, no webcam",
    description: "The whole frame over a blurred copy",
  },
]

function ModeIcon({ mode }: { mode: LayoutMode }) {
  const slots: Record<LayoutMode, [string, string] | [string]> = {
    "cam-top": [
      "inset-[0_0_64%_0] bg-amber/35",
      "inset-[36%_0_0_0] bg-white/18",
    ],
    "split-50": [
      "inset-[0_0_50%_0] bg-amber/35",
      "inset-[50%_0_0_0] bg-white/18",
    ],
    "no-cam-fill": ["inset-0 bg-white/18"],
    "no-cam-blur-fill": ["inset-x-0 top-[37%] h-[26%] bg-white/24"],
  }
  return (
    <span
      aria-hidden
      className="relative mb-1.5 h-10 w-[23px] overflow-hidden rounded-[5px] bg-night inset-ring-1 inset-ring-white/14"
    >
      {slots[mode].map((slot) => (
        <span key={slot} className={`absolute ${slot}`} />
      ))}
    </span>
  )
}

export function LayoutModeOptions({
  value,
  onValueChange,
  disabled,
}: {
  value: LayoutMode
  onValueChange: (mode: LayoutMode) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2">
      <span
        id="layout-mode-label"
        className="text-[13px] text-muted-foreground"
      >
        Mode
      </span>
      <ToggleGroup
        aria-labelledby="layout-mode-label"
        value={[value]}
        onValueChange={(next) => {
          const mode = layoutModeSchema.safeParse(next[0])
          if (mode.success) onValueChange(mode.data)
        }}
        disabled={disabled}
        className="grid w-full grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2"
      >
        {LAYOUT_MODES.map((mode) => (
          <ToggleGroupItem
            key={mode.value}
            value={mode.value}
            className="grid h-auto justify-items-start gap-0.5 rounded-[14px] bg-graphite-2 p-3.5 text-start whitespace-normal inset-ring-1 inset-ring-hair hover:bg-graphite-3 aria-pressed:bg-lav/10 aria-pressed:inset-ring-lav/60"
          >
            <ModeIcon mode={mode.value} />
            <b className="text-sm font-semibold">{mode.label}</b>
            <span className="text-xs font-normal text-muted-foreground">
              {mode.description}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export const DEFAULT_WEBCAM: Rect = { x: 0.7, y: 0.7, w: 0.25, h: 0.25 }
export function CamPositionField({
  value,
  onValueChange,
  disabled,
}: {
  value: CamPosition
  onValueChange: (value: CamPosition) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="cam-position-label">Webcam goes</Label>
      <ToggleGroup
        aria-labelledby="cam-position-label"
        variant="outline"
        size="sm"
        value={[value]}
        onValueChange={(next) => {
          const parsed = camPositionSchema.safeParse(next[0])
          if (parsed.success) onValueChange(parsed.data)
        }}
        disabled={disabled}
      >
        <ToggleGroupItem value="top">On top</ToggleGroupItem>
        <ToggleGroupItem value="bottom">At the bottom</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

const FALLBACK_SAMPLE: CaptionWord[] = "Captions look like this on your clips"
  .split(" ")
  .map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 260 }))

const SAMPLE_PAUSE_MS = 800

function useLoopMs(durationMs: number) {
  const [ms, setMs] = React.useState(0)
  React.useEffect(() => {
    const started = performance.now()
    const timer = setInterval(
      () => setMs((performance.now() - started) % durationMs),
      50
    )
    return () => clearInterval(timer)
  }, [durationMs])
  return ms
}

function LayoutPreview({
  layout,
  captionStyle,
  captionsEnabled,
  sample,
}: {
  layout: LayoutInput
  captionStyle: CaptionStyleRef
  captionsEnabled: boolean
  sample: CaptionWord[]
}) {
  const style = resolveCaptionStyle(captionStyle)
  const words = sample.length > 0 ? sample : FALLBACK_SAMPLE
  const durationMs = words.at(-1)!.endMs + SAMPLE_PAUSE_MS
  const pages = buildCaptionPages(words, durationMs, {
    maxWordsPerPage: style.maxWordsPerPage,
    maxCharsPerLine: style.maxCharsPerLine,
  })
  const currentMs = useLoopMs(durationMs)
  return (
    <CaptionPreview
      role="img"
      aria-label="Vertical preview"
      className="max-w-[300px] rounded-[26px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_40px_90px_-30px_rgb(0_0_0/0.9)]"
    >
      <VerticalPreviewCanvas
        layout={layout}
        aria-hidden
        data-testid="layout-preview"
        className="absolute inset-0 size-full"
      />
      {captionsEnabled && (
        <CaptionPreviewText
          pages={pages}
          currentMs={currentMs}
          captionStyle={cssCaptionStyle(style)}
          baseline={captionBaseline(style, layout)}
        />
      )}
    </CaptionPreview>
  )
}

export function GameplayRegion({
  layout,
  width,
  height,
  onLayoutChange,
}: {
  layout: LayoutInput
  width: number
  height: number
  onLayoutChange: (patch: Partial<LayoutInput>) => void
}) {
  const box = gameplayBox(layout, width, height)
  const aspect = gameplaySlotAspect(layout.mode)
  if (!box || !aspect) return null
  return (
    <CropRegion
      aria-label="Gameplay region"
      value={box}
      aspectRatio={aspect}
      onValueChange={(gameplayRect) =>
        onLayoutChange({ gameplayRect, gameplayFocusX: 0.5 })
      }
      className="border-dashed border-white/70 shadow-none"
    />
  )
}

export function withLayoutMode(
  layout: LayoutInput,
  mode: LayoutMode,
  width: number,
  height: number
): Partial<LayoutInput> {
  return {
    mode,
    webcamRect: usesWebcam(mode)
      ? (layout.webcamRect ?? DEFAULT_WEBCAM)
      : layout.webcamRect,
    ...refitGameplay(layout, mode, width, height),
  }
}

export function LayoutEditor({
  projectId,
  src,
  sourceWidth,
  sourceHeight,
  initial,
  initialConfidence,
  confirmed,
  awaitingConfirmation,
  settings,
  captionSample,
  installedFonts,
}: {
  projectId: string
  src: string
  sourceWidth: number
  sourceHeight: number
  initial: LayoutInput
  initialConfidence: number
  confirmed: boolean
  awaitingConfirmation: boolean
  settings: ProjectSettings
  captionSample: CaptionWord[]
  installedFonts: readonly CaptionFontId[]
}) {
  const router = useRouter()
  const autoDetect = !confirmed && initial.webcamRect === null
  const [layout, setLayout] = React.useState(initial)
  const [confidence, setConfidence] = React.useState(initialConfidence)
  const [detecting, setDetecting] = React.useState(autoDetect)
  const [savePreset, setSavePreset] = React.useState(false)
  const [captionStyle, setCaptionStyle] = React.useState(settings.captionStyle)
  const captionStyleChanged =
    JSON.stringify(captionStyle) !== JSON.stringify(settings.captionStyle)
  const [pending, startTransition] = React.useTransition()
  const hasWebcam = usesWebcam(layout.mode)

  const applyDetection = React.useCallback((result: WebcamDetection) => {
    setLayout((current) => ({
      webcamRect: result.webcamRect,
      gameplayRect: result.gameplayRect,
      gameplayFocusX: result.gameplayFocusX,
      mode: result.mode,
      camPosition: current.camPosition,
    }))
    setConfidence(result.confidence)
    setDetecting(false)
    if (result.mode === "no-cam-blur-fill") {
      toast.info("No webcam found. Mark it yourself if there is one.")
    } else {
      toast.success(
        `Webcam found (${Math.round(result.confidence * 100)}% confident)`
      )
    }
  }, [])

  const failDetection = React.useCallback((error: unknown) => {
    setDetecting(false)
    toast.error(
      error instanceof Error ? error.message : "Webcam detection failed"
    )
  }, [])

  React.useEffect(() => {
    if (!autoDetect) return
    const controller = new AbortController()
    detectWebcam(src, { signal: controller.signal }).then(
      applyDetection,
      (error) => {
        if (!controller.signal.aborted) failDetection(error)
      }
    )
    return () => controller.abort()
  }, [autoDetect, src, applyDetection, failDetection])

  const update = (patch: Partial<LayoutInput>) =>
    setLayout((current) => ({ ...current, ...patch }))

  const confirm = () =>
    startTransition(async () => {
      if (captionStyleChanged) {
        const saved = await updateProjectSettingsAction(projectId, {
          ...settings,
          captionStyle,
        })
        if (!saved.ok) {
          toast.error(saved.error.message)
          return
        }
        if (saved.value.rerun === "render") {
          toast.info("Render the clips again to use the new caption style")
        }
      }
      const result = await confirmLayoutAction(projectId, {
        layout: hasWebcam
          ? { ...layout, webcamRect: layout.webcamRect ?? DEFAULT_WEBCAM }
          : layout,
        confidence,
        savePreset,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(awaitingConfirmation ? "Layout confirmed" : "Layout saved")
      router.refresh()
    })

  return (
    <VideoPlayerProvider defaultMuted>
      <div className="flex flex-wrap items-start gap-[22px]">
        <div className="grid min-w-0 flex-[999_1_560px] gap-[18px]">
          <section className="grid gap-3.5 rounded-[18px] bg-graphite p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
                  Source frame
                </h2>
                <p className="text-[13px] text-tertiary">
                  {detecting
                    ? "Looking for the webcam…"
                    : hasWebcam
                      ? "Drag the solid box over the webcam, the dashed one over the gameplay. Arrow keys nudge, corners resize."
                      : layout.mode === "no-cam-fill"
                        ? "The dashed box is the part of the frame that fills the short. Drag it, or drag a corner to resize."
                        : "The whole frame is shown over a blurred copy of itself."}
                </p>
              </div>
              <Button
                size="sm"
                disabled={detecting || pending}
                onClick={() => {
                  setDetecting(true)
                  detectWebcam(src).then(applyDetection, failDetection)
                }}
              >
                {detecting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <MagicWandIcon data-icon="inline-start" aria-hidden />
                )}
                Detect again
              </Button>
            </div>
            <div className="overflow-hidden rounded-xl bg-black">
              <CropRegionEditor
                value={layout.webcamRect ?? DEFAULT_WEBCAM}
                onValueChange={(webcamRect) => update({ webcamRect })}
                disabled={detecting}
                className="rounded-none"
                style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
              >
                <VideoPlayerVideo src={src} className="size-full" />
                <GameplayRegion
                  layout={layout}
                  width={sourceWidth}
                  height={sourceHeight}
                  onLayoutChange={update}
                />
                {hasWebcam && <CropRegion aria-label="Webcam region" />}
              </CropRegionEditor>
              <VideoPlayerControls>
                <VideoPlayerPlayButton />
                <VideoPlayerSeekBar />
                <VideoPlayerTime />
              </VideoPlayerControls>
            </div>
            <FrameChecks />
          </section>

          <section className="grid gap-5 rounded-[18px] bg-graphite p-[22px]">
            <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
              Layout
            </h2>
            <LayoutModeOptions
              value={layout.mode}
              onValueChange={(mode) =>
                update(withLayoutMode(layout, mode, sourceWidth, sourceHeight))
              }
              disabled={detecting}
            />
            <div className="flex flex-wrap items-end gap-6">
              {hasWebcam && (
                <CamPositionField
                  value={layout.camPosition ?? "top"}
                  onValueChange={(camPosition) => update({ camPosition })}
                  disabled={detecting}
                />
              )}
              <div className="flex items-center gap-2.5 pb-1.5">
                <Switch
                  id="save-preset"
                  checked={savePreset}
                  onCheckedChange={setSavePreset}
                />
                <Label htmlFor="save-preset">
                  Use for every {sourceWidth}×{sourceHeight} recording
                </Label>
              </div>
            </div>
          </section>

          <section
            id="captions"
            className="grid gap-5 rounded-[18px] bg-graphite p-[22px]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
                Captions
              </h2>
              <span className="text-[13px] text-tertiary">
                {settings.captionsEnabled
                  ? "Applies to every clip without its own style"
                  : "Captions are turned off for this project"}
              </span>
            </div>
            <CaptionStyleFields
              value={captionStyle}
              onValueChange={setCaptionStyle}
              installedFonts={installedFonts}
              disabled={pending}
            />
          </section>
        </div>

        <aside className="grid min-w-0 flex-[1_1_300px] justify-items-center gap-3.5 lg:sticky lg:top-6">
          <div className="flex w-full max-w-[300px] items-baseline justify-between">
            <span className="mono-label">Preview</span>
            <span className="font-mono text-[11px] text-tertiary">
              1080×1920
            </span>
          </div>
          <div className="w-full max-w-[300px]">
            <LayoutPreview
              layout={layout}
              captionStyle={captionStyle}
              captionsEnabled={settings.captionsEnabled}
              sample={captionSample}
            />
          </div>
          <p className="max-w-[280px] text-center text-[13px] text-tertiary">
            Scrub the source to check other moments. The preview follows.
          </p>
          <div className="grid w-full max-w-[300px] justify-items-center gap-2">
            <Button
              variant="primary"
              disabled={pending || detecting}
              onClick={confirm}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {awaitingConfirmation ? "Confirm layout" : "Save layout"}
            </Button>
            <span className="text-center text-xs text-tertiary">
              {awaitingConfirmation
                ? "Then review the clips. Nothing renders until you approve them."
                : "Rendered clips keep their layout until you render them again."}
            </span>
          </div>
        </aside>
      </div>
    </VideoPlayerProvider>
  )
}

function FrameChecks() {
  const { durationMs, currentMs, seek } = useVideoPlayer()
  if (!durationMs) return null
  const marks = Array.from({ length: 6 }, (_, i) =>
    Math.round((durationMs * (i + 0.5)) / 6)
  )
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">
          Check it across the recording
        </span>
        <span className="font-mono text-[11px] text-tertiary tabular-nums">
          {formatDuration(currentMs)} / {formatDuration(durationMs)}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {marks.map((ms) => (
          <button
            key={ms}
            type="button"
            onClick={() => seek(ms)}
            aria-label={`Jump to ${formatDuration(ms)}`}
            className="rounded-lg bg-graphite-2 py-2 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:bg-graphite-3 hover:text-foreground"
          >
            {formatDuration(ms)}
          </button>
        ))}
      </div>
    </div>
  )
}
