"use client"

import { MagicWandIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { Slider } from "@/components/ui/slider"
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
import { confirmLayoutAction } from "@/features/layout/actions"
import {
  detectWebcam,
  type WebcamDetection,
} from "@/features/layout/detect-webcam"
import { planLayout } from "@/features/layout/geometry"
import {
  layoutModeSchema,
  usesWebcam,
  type LayoutInput,
  type LayoutMode,
  type Rect,
} from "@/features/layout/schema"

import { VerticalPreviewCanvas } from "./vertical-preview"

const MODES: { value: LayoutMode; label: string }[] = [
  { value: "cam-top", label: "Webcam on top" },
  { value: "split-50", label: "Even split" },
  { value: "no-cam-fill", label: "Fill, no webcam" },
  { value: "no-cam-blur-fill", label: "Fit, no webcam" },
]

const DEFAULT_WEBCAM: Rect = { x: 0.7, y: 0.7, w: 0.25, h: 0.25 }
function LayoutPreview({ layout }: { layout: LayoutInput }) {
  return (
    <VerticalPreviewCanvas
      layout={layout}
      role="img"
      aria-label="Vertical preview"
      data-testid="layout-preview"
      className="max-w-[220px] rounded-lg"
    />
  )
}

function GameplayWindow({
  layout,
  width,
  height,
}: {
  layout: LayoutInput
  width: number
  height: number
}) {
  const plan = planLayout(layout, width, height)
  if (plan.mode === "no-cam-blur-fill") return null
  const crop = plan.mode === "no-cam-fill" ? plan.crop : plan.regions[1].crop
  return (
    <div
      aria-hidden
      data-testid="gameplay-window"
      className="pointer-events-none absolute border-2 border-dashed border-white/70"
      style={{
        left: `${(crop.x / width) * 100}%`,
        top: `${(crop.y / height) * 100}%`,
        width: `${(crop.w / width) * 100}%`,
        height: `${(crop.h / height) * 100}%`,
      }}
    />
  )
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
}: {
  projectId: string
  src: string
  sourceWidth: number
  sourceHeight: number
  initial: LayoutInput
  initialConfidence: number
  confirmed: boolean
  awaitingConfirmation: boolean
}) {
  const router = useRouter()
  const autoDetect = !confirmed && initial.webcamRect === null
  const [layout, setLayout] = React.useState(initial)
  const [confidence, setConfidence] = React.useState(initialConfidence)
  const [detecting, setDetecting] = React.useState(autoDetect)
  const [savePreset, setSavePreset] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const hasWebcam = usesWebcam(layout.mode)

  const applyDetection = React.useCallback((result: WebcamDetection) => {
    setLayout({
      webcamRect: result.webcamRect,
      gameplayRect: result.gameplayRect,
      gameplayFocusX: result.gameplayFocusX,
      mode: result.mode,
    })
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
              disabled={!hasWebcam || detecting}
              className="rounded-none"
              style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
            >
              <VideoPlayerVideo src={src} className="size-full" />
              <GameplayWindow
                layout={layout}
                width={sourceWidth}
                height={sourceHeight}
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
                    ? "Drag the box over the webcam, or focus it and use the arrow keys. The dashed box is the gameplay area that ends up below it."
                    : layout.mode === "no-cam-fill"
                      ? "The dashed box is the part of the frame that fills the short. Move it with Gameplay focus."
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
                    update({
                      mode: mode.data,
                      webcamRect: usesWebcam(mode.data)
                        ? (layout.webcamRect ?? DEFAULT_WEBCAM)
                        : layout.webcamRect,
                    })
                  }}
                  disabled={detecting}
                >
                  {MODES.map((mode) => (
                    <ToggleGroupItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {layout.mode !== "no-cam-blur-fill" && (
                <div className="flex flex-col gap-2">
                  <Label id="gameplay-focus-label">Gameplay focus</Label>
                  <Slider
                    aria-labelledby="gameplay-focus-label"
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(layout.gameplayFocusX * 100)]}
                    format={{ style: "unit", unit: "percent" }}
                    onValueChange={(value) => {
                      const focus = Array.isArray(value) ? value[0] : value
                      if (focus !== undefined)
                        update({ gameplayFocusX: focus / 100 })
                    }}
                    className="max-w-sm"
                  />
                </div>
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
                  variant="outline"
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
        </div>

        <div className="flex flex-col items-center gap-2 lg:items-start">
          <LayoutPreview layout={layout} />
          <p className="text-xs text-muted-foreground">
            1080×1920 preview at the current frame
          </p>
        </div>
      </div>
    </VideoPlayerProvider>
  )
}
