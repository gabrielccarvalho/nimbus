"use client"

import {
  ArrowCounterClockwiseIcon,
  MagicWandIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { DotMeter } from "@/components/ui/dot-meter"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toneVariants } from "@/components/ui/tone"
import {
  CAPTION_FONTS,
  type CaptionFontId,
  type CaptionStyle,
} from "@/features/captions/styles"
import {
  CAPTION_MAX_OFFSET_MS,
  CAPTION_TEXT_MAX,
} from "@/features/clips/schema"
import type { ClipEffects, Effect } from "@/features/effects/schema"
import {
  layoutModeSchema,
  type CamPosition,
  type LayoutInput,
  type LayoutMode,
} from "@/features/layout/schema"
import type { ProjectSettings } from "@/features/projects/schema"
import {
  setCaptionText,
  type CaptionBlock,
  type CaptionRef,
  type CaptionState,
} from "@/features/timeline/captions"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { CaptionStyleFields } from "./caption-style-fields"
import { ClipStats } from "./clip-stats"
import { effectText, effectTone } from "./clip-timeline"
import { IconAction } from "./icon-action"
import { CamPositionField, LAYOUT_MODES } from "./layout-fields"
import type { PublicationState } from "./publish-dialog"

export const INSPECTOR_TABS = [
  { value: "details", label: "Details" },
  { value: "captions", label: "Captions" },
  { value: "layout", label: "Layout" },
  { value: "effects", label: "Effects" },
] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]["value"]

const TITLE_MAX = 100
const HOOK_MAX = 200
const OFFSET_STEP_MS = 100
const MODE_LABELS: Record<LayoutMode, string> = {
  "cam-top": "Webcam top",
  "split-50": "Split",
  "no-cam-fill": "Fill",
  "no-cam-blur-fill": "Fit",
}
const SHAKE_INTENSITIES = [
  { value: "light", label: "Light" },
  { value: "strong", label: "Strong" },
] as const

const HELP = "text-[13px] text-tertiary"
const FIELD_LABEL = "text-[13.5px]"
const INSET = "rounded-[14px] bg-graphite-2"

function formatOffset(ms: number) {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : ""
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)} s`
}

export function ClipInspector({
  tab,
  onTabChange,
  children,
}: {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  children: React.ReactNode
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const found = INSPECTOR_TABS.find((item) => item.value === next)
        if (found) onTabChange(found.value)
      }}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="shrink-0 px-3.5 pt-3.5 pb-3">
        <TabsList
          aria-label="Clip inspector"
          className="flex w-full flex-nowrap"
        >
          {INSPECTOR_TABS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="flex-1 px-1.5 text-[13.5px]"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
        {children}
      </div>
    </Tabs>
  )
}

export function DetailsPanel({
  title,
  onTitleChange,
  hook,
  onHookChange,
  score,
  reason,
  publication,
}: {
  title: string
  onTitleChange: (title: string) => void
  hook: string
  onHookChange: (hook: string) => void
  score: number
  reason: string | null
  publication?: PublicationState
}) {
  const id = React.useId()
  return (
    <TabsContent value="details" className="grid gap-[18px]">
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-title`} className={FIELD_LABEL}>
            Title
          </Label>
          <span className="font-mono text-xs text-tertiary tabular-nums">
            {title.length} / {TITLE_MAX}
          </span>
        </div>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={TITLE_MAX}
          required
          aria-describedby={`${id}-title-help`}
          onChange={(event) => onTitleChange(event.target.value)}
        />
        <p id={`${id}-title-help`} className={HELP}>
          Used for the file name and the export manifest.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-hook`} className={FIELD_LABEL}>
          Hook
        </Label>
        <Textarea
          id={`${id}-hook`}
          value={hook}
          rows={2}
          maxLength={HOOK_MAX}
          aria-describedby={`${id}-hook-help`}
          onChange={(event) => onHookChange(event.target.value)}
          className="min-h-16 rounded-xl border-0 bg-graphite-2 px-3.5 py-2.5 text-[15px] tracking-[-0.011em] inset-ring-1 inset-ring-hair transition-shadow duration-200 placeholder:text-tertiary focus-visible:ring-3 focus-visible:ring-lav/16 focus-visible:inset-ring-lav md:text-[15px] dark:bg-graphite-2"
        />
        <p id={`${id}-hook-help`} className={HELP}>
          Put it on screen with Add › Text, then set its timing on the Text
          track.
        </p>
      </div>
      {(reason || score > 0) && (
        <div className={cn(INSET, "grid gap-2 p-3.5")}>
          <div className="flex items-center gap-2.5">
            <DotMeter
              value={Math.round(score * 10)}
              aria-label="Clip score"
              tone="mint"
            />
            <b className="text-[13px] font-semibold">Why this clip</b>
            <span className="ms-auto font-mono text-xs text-tertiary tabular-nums">
              {score.toFixed(2)}
            </span>
          </div>
          {reason && <p className={HELP}>{reason}</p>}
        </div>
      )}
      {publication &&
        (publication.status === "published" ||
          publication.status === "removed") && (
          <ClipStats publication={publication} />
        )}
    </TabsContent>
  )
}

function CaptionRow({
  block,
  current,
  disabled,
  onTextChange,
}: {
  block: CaptionBlock
  current: boolean
  disabled: boolean
  onTextChange: (text: string) => void
}) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const time = formatTimestamp(block.startMs)
  return (
    <li
      data-current={current || undefined}
      className="group/row grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] px-1 py-[3px] data-current:bg-amber/10 data-current:inset-ring-1 data-current:inset-ring-amber/35"
    >
      <span className="font-mono text-xs text-tertiary tabular-nums group-data-current/row:text-amber">
        {time}
      </span>
      <Input
        aria-label={`Caption at ${time}`}
        value={draft ?? block.text}
        maxLength={CAPTION_TEXT_MAX}
        disabled={disabled}
        className="h-9 rounded-[10px] px-2.5 text-[13.5px]"
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim()) onTextChange(event.target.value)
        }}
        onBlur={() => setDraft(null)}
      />
    </li>
  )
}

export function CaptionsPanel({
  style,
  styleRef,
  onStyleRefChange,
  installedFonts,
  enabled,
  onEnabledChange,
  captions,
  onCaptionsChange,
  blocks,
  playheadMs,
  disabled = false,
}: {
  style: CaptionStyle
  styleRef: ProjectSettings["captionStyle"]
  onStyleRefChange: (ref: ProjectSettings["captionStyle"]) => void
  installedFonts: readonly CaptionFontId[]
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  captions: CaptionState
  onCaptionsChange: (captions: CaptionState) => void
  blocks: readonly (readonly CaptionBlock[])[]
  playheadMs: number
  disabled?: boolean
}) {
  const id = React.useId()
  const [editingStyle, setEditingStyle] = React.useState(false)
  const rows = blocks
    .flatMap((lane, index) =>
      lane.map((block) => ({
        block,
        ref: { lane: index, index: block.index } satisfies CaptionRef,
      }))
    )
    .sort((a, b) => a.block.startMs - b.block.startMs)
  const edited =
    captions.offsetMs !== 0 || Object.keys(captions.pageEdits).length > 0
  const shift = (delta: number) =>
    onCaptionsChange({
      ...captions,
      offsetMs: Math.min(
        CAPTION_MAX_OFFSET_MS,
        Math.max(-CAPTION_MAX_OFFSET_MS, captions.offsetMs + delta)
      ),
    })

  return (
    <TabsContent value="captions" className="grid gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          {style.label} · {CAPTION_FONTS[style.font].label} ·{" "}
          {style.maxWordsPerPage} words
        </span>
        <Button
          type="button"
          variant="link"
          size="xs"
          aria-expanded={editingStyle}
          aria-controls={`${id}-style`}
          className="h-auto px-0 text-[12.5px]"
          onClick={() => setEditingStyle(!editingStyle)}
        >
          {editingStyle ? "Done" : "Edit style"}
        </Button>
      </div>
      <div id={`${id}-style`} hidden={!editingStyle} className="grid gap-4">
        {editingStyle && (
          <CaptionStyleFields
            value={styleRef}
            onValueChange={onStyleRefChange}
            installedFonts={installedFonts}
            disabled={!enabled || disabled}
          />
        )}
      </div>
      <div className={cn(INSET, "grid gap-3 px-3.5 py-3")}>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-enabled`} className={FIELD_LABEL}>
            Show captions
          </Label>
          <Switch
            id={`${id}-enabled`}
            checked={enabled}
            disabled={disabled}
            onCheckedChange={onEnabledChange}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span id={`${id}-timing`} className="text-[13.5px] font-medium">
            Caption timing
          </span>
          <div
            role="group"
            aria-labelledby={`${id}-timing`}
            className="flex items-center gap-1"
          >
            <Button
              type="button"
              size="icon-xs"
              aria-label="Show captions earlier"
              disabled={
                disabled ||
                !enabled ||
                captions.offsetMs <= -CAPTION_MAX_OFFSET_MS
              }
              onClick={() => shift(-OFFSET_STEP_MS)}
            >
              <MinusIcon aria-hidden />
            </Button>
            <output
              aria-live="polite"
              className="w-14 text-center font-mono text-xs tabular-nums"
            >
              {formatOffset(captions.offsetMs)}
            </output>
            <Button
              type="button"
              size="icon-xs"
              aria-label="Show captions later"
              disabled={
                disabled ||
                !enabled ||
                captions.offsetMs >= CAPTION_MAX_OFFSET_MS
              }
              onClick={() => shift(OFFSET_STEP_MS)}
            >
              <PlusIcon aria-hidden />
            </Button>
          </div>
        </div>
        {edited && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto justify-self-start px-0 text-[12.5px]"
            disabled={disabled}
            onClick={() =>
              onCaptionsChange({ ...captions, pageEdits: {}, offsetMs: 0 })
            }
          >
            <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
            Reset spoken captions
          </Button>
        )}
      </div>
      {rows.length > 0 ? (
        <ul aria-label="Captions" className="grid gap-1.5">
          {rows.map(({ block, ref }) => (
            <CaptionRow
              key={`${ref.lane}:${ref.index}`}
              block={block}
              current={
                enabled &&
                block.startMs <= playheadMs &&
                playheadMs < block.endMs
              }
              disabled={disabled || !enabled}
              onTextChange={(text) =>
                onCaptionsChange(setCaptionText(captions, ref, text))
              }
            />
          ))}
        </ul>
      ) : (
        <p className={HELP}>No one speaks in this clip.</p>
      )}
      <p className={HELP}>
        {enabled
          ? "The highlighted line is under the playhead. Edits keep their timing."
          : "Captions are off for this clip."}
      </p>
    </TabsContent>
  )
}

export function LayoutPanel({
  layout,
  hasWebcam,
  detecting,
  onFindWebcam,
  onModeChange,
  onCamPositionChange,
}: {
  layout: LayoutInput
  hasWebcam: boolean
  detecting: boolean
  onFindWebcam: () => void
  onModeChange: (mode: LayoutMode) => void
  onCamPositionChange: (position: CamPosition) => void
}) {
  const id = React.useId()
  const mode = LAYOUT_MODES.find((item) => item.value === layout.mode)
  return (
    <TabsContent value="layout" className="grid gap-[18px]">
      <div className={cn(INSET, "grid gap-3 px-3.5 py-3")}>
        <p className={HELP} aria-live="polite">
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
          className="justify-self-start"
          disabled={detecting}
          onClick={onFindWebcam}
        >
          {detecting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <MagicWandIcon data-icon="inline-start" aria-hidden />
          )}
          Find webcam
        </Button>
      </div>
      <div className="grid gap-2">
        <span id={`${id}-mode`} className="text-[13.5px] font-medium">
          Mode
        </span>
        <Segmented
          aria-labelledby={`${id}-mode`}
          layout="fill"
          value={[layout.mode]}
          disabled={detecting}
          onValueChange={(next) => {
            const parsed = layoutModeSchema.safeParse(next[0])
            if (parsed.success) onModeChange(parsed.data)
          }}
        >
          {LAYOUT_MODES.map((item) => (
            <SegmentedItem key={item.value} value={item.value}>
              {MODE_LABELS[item.value]}
            </SegmentedItem>
          ))}
        </Segmented>
        {mode && <p className={HELP}>{mode.description}</p>}
      </div>
      {hasWebcam && (
        <CamPositionField
          value={layout.camPosition ?? "top"}
          onValueChange={onCamPositionChange}
        />
      )}
    </TabsContent>
  )
}

function EffectCard({
  effect,
  index,
  clipStartMs,
  hasWebcam,
  selected,
  disabled,
  onSelect,
  onChange,
  onDelete,
}: {
  effect: Effect
  index: number
  clipStartMs: number
  hasWebcam: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onChange: (effect: Effect) => void
  onDelete: () => void
}) {
  const id = React.useId()
  const text = effectText(effect)
  return (
    <li
      data-effect-card={index}
      data-selected={selected || undefined}
      className={cn(
        INSET,
        toneVariants({ tone: effectTone(effect) }),
        "grid scroll-my-2 gap-2.5 px-3.5 py-3 data-selected:inset-ring-[1.5px] data-selected:inset-ring-lav"
      )}
      onPointerDown={onSelect}
      onFocusCapture={onSelect}
    >
      <div className="flex items-center gap-2">
        <b className="text-[13.5px] font-semibold text-[rgb(var(--tone))]">
          {text}
        </b>
        <span className="ms-auto font-mono text-xs text-tertiary tabular-nums">
          {formatTimestamp(effect.startMs - clipStartMs)} →{" "}
          {formatTimestamp(effect.endMs - clipStartMs)}
        </span>
        <IconAction
          label={`Delete ${text}`}
          size="icon-xs"
          className="-me-1.5"
          disabled={disabled}
          onClick={onDelete}
        >
          <TrashIcon aria-hidden />
        </IconAction>
      </div>
      {effect.kind === "zoom" && (
        <>
          <div className="flex items-center gap-3">
            <Label id={`${id}-scale`} className="text-[13px] text-tertiary">
              Strength
            </Label>
            <Slider
              aria-labelledby={`${id}-scale`}
              min={1.1}
              max={2}
              step={0.1}
              value={[effect.scale]}
              disabled={disabled}
              getAriaValueText={(_, value) => `${value}×`}
              onValueChange={(next) => {
                const scale = Array.isArray(next) ? next[0] : next
                if (typeof scale === "number")
                  onChange({ ...effect, scale: Math.round(scale * 10) / 10 })
              }}
            />
            <span className="w-9 text-right font-mono text-xs tabular-nums">
              {effect.scale}×
            </span>
          </div>
          {selected && (
            <p className={HELP}>Click the preview to set the focus point.</p>
          )}
        </>
      )}
      {effect.kind === "shake" && (
        <div className="flex items-center gap-3">
          <span id={`${id}-intensity`} className="text-[13px] text-tertiary">
            Intensity
          </span>
          <Segmented
            aria-labelledby={`${id}-intensity`}
            value={[effect.intensity]}
            disabled={disabled}
            onValueChange={(next) => {
              const intensity = SHAKE_INTENSITIES.find(
                (option) => option.value === next[0]
              )?.value
              if (intensity) onChange({ ...effect, intensity })
            }}
          >
            {SHAKE_INTENSITIES.map((option) => (
              <SegmentedItem
                key={option.value}
                value={option.value}
                className="px-3 py-1.5 text-[12.5px]"
              >
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </div>
      )}
      {effect.kind === "focus" && !hasWebcam && (
        <p className={HELP}>No webcam in this layout</p>
      )}
    </li>
  )
}

export function EffectsPanel({
  effects,
  clipStartMs,
  hasWebcam,
  selected,
  onSelect,
  onEffectsChange,
  onPlan,
  planning,
  disabled = false,
}: {
  effects: ClipEffects | null
  clipStartMs: number
  hasWebcam: boolean
  selected: number | null
  onSelect: (index: number | null) => void
  onEffectsChange: (effects: ClipEffects) => void
  onPlan: () => void
  planning: boolean
  disabled?: boolean
}) {
  const events = effects?.events ?? []
  const setEvents = (next: Effect[]) =>
    onEffectsChange({ events: next, edited: true })
  const order = events
    .map((effect, index) => ({ effect, index }))
    .sort((a, b) => a.effect.startMs - b.effect.startMs)

  return (
    <TabsContent value="effects" className="grid gap-3.5">
      <p className={HELP}>
        {events.length > 0
          ? "Planned from the audio. Select one on the timeline to edit it."
          : "No effects yet. Add one from the timeline, or plan them from the audio."}
      </p>
      {order.length > 0 && (
        <ul aria-label="Effects" className="grid gap-2.5">
          {order.map(({ effect, index }) => (
            <EffectCard
              key={index}
              effect={effect}
              index={index}
              clipStartMs={clipStartMs}
              hasWebcam={hasWebcam}
              selected={selected === index}
              disabled={disabled}
              onSelect={() => {
                if (selected !== index) onSelect(index)
              }}
              onChange={(next) =>
                setEvents(events.map((e, i) => (i === index ? next : e)))
              }
              onDelete={() => {
                setEvents(events.filter((_, i) => i !== index))
                onSelect(null)
              }}
            />
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="link"
        size="xs"
        className="h-auto justify-self-start px-0 text-[12.5px]"
        disabled={disabled || planning}
        onClick={onPlan}
      >
        {effects === null ? (
          <MagicWandIcon data-icon="inline-start" aria-hidden />
        ) : (
          <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
        )}
        {effects === null ? "Auto effects" : "Reset effects to auto"}
      </Button>
    </TabsContent>
  )
}
