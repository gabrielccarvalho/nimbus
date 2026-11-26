"use client"

import { CropRegion } from "@/components/ui/crop-region-editor"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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

export function GameplayRegion({
  layout,
  width,
  height,
  onLayoutChange,
  children,
}: {
  layout: LayoutInput
  width: number
  height: number
  onLayoutChange: (patch: Partial<LayoutInput>) => void
  children?: React.ReactNode
}) {
  const box = gameplayBox(layout, width, height)
  const aspect = gameplaySlotAspect(layout.mode)
  if (!box || !aspect) return null
  return (
    <CropRegion
      aria-label="Gameplay region"
      variant="dashed"
      value={box}
      aspectRatio={aspect}
      onValueChange={(gameplayRect) =>
        onLayoutChange({ gameplayRect, gameplayFocusX: 0.5 })
      }
    >
      {children}
    </CropRegion>
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
