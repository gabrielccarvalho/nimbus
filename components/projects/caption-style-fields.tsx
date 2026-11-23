"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CAPTION_FONT_IDS,
  CAPTION_FONTS,
  CAPTION_PRESETS,
  captionStyleOverridesSchema,
  resolveCaptionStyle,
  type CaptionFontId,
  type CaptionStyleOverrides,
} from "@/features/captions/styles"
import type { ProjectSettings } from "@/features/projects/schema"

export type CaptionStyleRef = ProjectSettings["captionStyle"]

const CAPTION_POSITIONS = [
  { value: "auto", label: "Auto" },
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
] as const

const fontItems = CAPTION_FONT_IDS.map((font) => ({
  value: font,
  label: CAPTION_FONTS[font].label,
}))

const sliderValue = (value: number | readonly number[]) =>
  Array.isArray(value) ? value[0] : (value as number)

export function CaptionStyleFields({
  value,
  onValueChange,
  installedFonts,
  disabled,
}: {
  value: CaptionStyleRef
  onValueChange: (value: CaptionStyleRef) => void
  installedFonts: readonly CaptionFontId[]
  disabled?: boolean
}) {
  const id = React.useId()
  const style = resolveCaptionStyle(value)
  const set = <K extends keyof CaptionStyleOverrides>(
    key: K,
    next: CaptionStyleOverrides[K]
  ) => {
    if (!captionStyleOverridesSchema.shape[key].safeParse(next).success) return
    onValueChange({ ...value, overrides: { ...value.overrides, [key]: next } })
  }
  const shape = captionStyleOverridesSchema.shape

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label id={`${id}-style`}>Style</Label>
        <ToggleGroup
          aria-labelledby={`${id}-style`}
          variant="outline"
          size="sm"
          value={[style.id]}
          disabled={disabled}
          onValueChange={(next) => {
            if (!next[0]) return
            onValueChange({
              presetId: next[0],
              overrides:
                value.overrides?.position === undefined
                  ? {}
                  : { position: value.overrides.position },
            })
          }}
        >
          {CAPTION_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.id} value={preset.id}>
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-font`}>Font</Label>
        <Select
          items={fontItems}
          value={style.font}
          disabled={disabled}
          onValueChange={(next) => {
            const font = shape.font.safeParse(next)
            if (font.success) set("font", font.data)
          }}
        >
          <SelectTrigger id={`${id}-font`} className="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fontItems.map((font) => {
              const installed = installedFonts.includes(font.value)
              return (
                <SelectItem
                  key={font.value}
                  value={font.value}
                  disabled={!installed}
                  style={{
                    fontFamily: CAPTION_FONTS[font.value].cssFontFamily,
                  }}
                >
                  {font.label}
                  {!installed && (
                    <span className="font-sans text-xs text-muted-foreground">
                      Not installed
                    </span>
                  )}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label id={`${id}-position`}>Position</Label>
        <ToggleGroup
          aria-labelledby={`${id}-position`}
          variant="outline"
          size="sm"
          value={[style.position]}
          disabled={disabled}
          onValueChange={(next) => {
            const position = shape.position.safeParse(next[0])
            if (position.success) set("position", position.data)
          }}
        >
          {CAPTION_POSITIONS.map((position) => (
            <ToggleGroupItem key={position.value} value={position.value}>
              {position.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <Label id={`${id}-size`}>Size</Label>
        <Slider
          aria-labelledby={`${id}-size`}
          min={shape.fontSize.minValue ?? 36}
          max={shape.fontSize.maxValue ?? 160}
          step={2}
          value={[style.fontSize]}
          disabled={disabled}
          onValueChange={(next) => {
            const size = sliderValue(next)
            if (size !== undefined) set("fontSize", size)
          }}
          className="max-w-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label id={`${id}-words`}>Words per caption</Label>
        <Slider
          aria-labelledby={`${id}-words`}
          min={1}
          max={shape.maxWordsPerPage.maxValue ?? 8}
          step={1}
          value={[style.maxWordsPerPage]}
          disabled={disabled}
          onValueChange={(next) => {
            const words = sliderValue(next)
            if (words !== undefined) set("maxWordsPerPage", words)
          }}
          className="max-w-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-uppercase`}
          checked={style.uppercase}
          disabled={disabled}
          onCheckedChange={(checked) => set("uppercase", checked)}
        />
        <Label htmlFor={`${id}-uppercase`}>Uppercase</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-highlight`}
          checked={style.highlight}
          disabled={disabled}
          onCheckedChange={(checked) => set("highlight", checked)}
        />
        <Label htmlFor={`${id}-highlight`}>Highlight the spoken word</Label>
      </div>
    </div>
  )
}
