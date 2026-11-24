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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

import {
  CaptionStyleFields,
  type CaptionStyleRef,
} from "./caption-style-fields"
import { VerticalPreviewCanvas } from "./vertical-preview"

export const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: "cam-top", label: "Webcam on top" },
  { value: "split-50", label: "Even split" },
  { value: "no-cam-fill", label: "Fill, no webcam" },
  { value: "no-cam-blur-fill", label: "Fit, no webcam" },
]

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
      <Label id="cam-position-label">Webcam position</Label>
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
        <ToggleGroupItem value="top">Top</ToggleGroupItem>
        <ToggleGroupItem value="bottom">Bottom</ToggleGroupItem>
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
      className="max-w-[220px]"
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

  return (
    <VideoPlayerProvider defaultMuted>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex flex-col gap-4">
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

          <Card>
            <CardHeader>
              <CardTitle>Layout</CardTitle>
              <CardDescription>
                {detecting
                  ? "Looking for the webcam…"
                  : hasWebcam
                    ? "Drag the solid box over the webcam and the dashed box over the gameplay, or focus one and use the arrow keys. Drag a corner to resize."
                    : layout.mode === "no-cam-fill"
                      ? "The dashed box is the part of the frame that fills the short. Drag it, or drag a corner to resize."
                      : "The whole frame is shown over a blurred copy of itself."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label id="layout-mode-label">Mode</Label>
                <ToggleGroup
                  aria-labelledby="layout-mode-label"
                  variant="outline"
                  size="sm"
                  value={[layout.mode]}
                  onValueChange={(value) => {
                    const mode = layoutModeSchema.safeParse(value[0])
                    if (!mode.success) return
                    update(
                      withLayoutMode(
                        layout,
                        mode.data,
                        sourceWidth,
                        sourceHeight
                      )
                    )
                  }}
                  disabled={detecting}
                >
                  {LAYOUT_MODES.map((mode) => (
                    <ToggleGroupItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {hasWebcam && (
                <CamPositionField
                  value={layout.camPosition ?? "top"}
                  onValueChange={(camPosition) => update({ camPosition })}
                  disabled={detecting}
                />
              )}

              <div className="flex items-center gap-2">
                <Switch
                  id="save-preset"
                  checked={savePreset}
                  onCheckedChange={setSavePreset}
                />
                <Label htmlFor="save-preset">
                  Use for every {sourceWidth}×{sourceHeight} recording
                </Label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || detecting}
                  onClick={() =>
                    startTransition(async () => {
                      if (captionStyleChanged) {
                        const saved = await updateProjectSettingsAction(
                          projectId,
                          { ...settings, captionStyle }
                        )
                        if (!saved.ok) {
                          toast.error(saved.error.message)
                          return
                        }
                        if (saved.value.rerun === "render") {
                          toast.info(
                            "Render the clips again to use the new caption style"
                          )
                        }
                      }
                      const result = await confirmLayoutAction(projectId, {
                        layout: hasWebcam
                          ? {
                              ...layout,
                              webcamRect: layout.webcamRect ?? DEFAULT_WEBCAM,
                            }
                          : layout,
                        confidence,
                        savePreset,
                      })
                      if (!result.ok) {
                        toast.error(result.error.message)
                        return
                      }
                      toast.success(
                        awaitingConfirmation
                          ? "Layout confirmed"
                          : "Layout saved"
                      )
                      router.refresh()
                    })
                  }
                >
                  {pending && <Spinner data-icon="inline-start" />}
                  {awaitingConfirmation ? "Confirm layout" : "Save layout"}
                </Button>
                <Button
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
                  Detect webcam
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Captions</CardTitle>
              <CardDescription>
                {settings.captionsEnabled
                  ? "Applies to every clip that doesn't have its own style. Saved with the layout."
                  : "Captions are turned off for this project in Settings."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CaptionStyleFields
                value={captionStyle}
                onValueChange={setCaptionStyle}
                installedFonts={installedFonts}
                disabled={pending}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col items-center gap-2 lg:items-start">
          <LayoutPreview
            layout={layout}
            captionStyle={captionStyle}
            captionsEnabled={settings.captionsEnabled}
            sample={captionSample}
          />
          <p className="text-xs text-muted-foreground">
            1080×1920 preview at the current frame
          </p>
        </div>
      </div>
    </VideoPlayerProvider>
  )
}
