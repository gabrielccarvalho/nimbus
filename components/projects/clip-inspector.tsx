"use client"

import {
  ArrowCounterClockwiseIcon,
  MagicWandIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { DotMeter } from "@/components/ui/dot-meter"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CAPTION_FONTS,
  type CaptionFontId,
  type CaptionStyle,
} from "@/features/captions/styles"
import { CAPTION_MAX_OFFSET_MS } from "@/features/clips/schema"
import {
  layoutModeSchema,
  type CamPosition,
  type LayoutInput,
  type LayoutMode,
} from "@/features/layout/schema"
import type { ProjectSettings } from "@/features/projects/schema"
import type { CaptionState } from "@/features/timeline/captions"
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"
import { cn } from "@/lib/utils"

import { CaptionStyleFields } from "./caption-style-fields"
import { ClipStats } from "./clip-stats"
import { CamPositionField, LAYOUT_MODES } from "./layout-fields"
import { editor } from "./messages/editor"
import type { PublicationState } from "./publish-dialog"

export const INSPECTOR_TABS = ["details", "captions", "layout"] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]

const TITLE_MAX = 100
const HOOK_MAX = 200
const OFFSET_STEP_MS = 100
const HELP = "text-[13px] text-tertiary"
const FIELD_LABEL = "text-[13.5px]"
const INSET = "rounded-[14px] bg-graphite-2"

export function ClipInspector({
  tab,
  onTabChange,
  children,
}: {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  children: React.ReactNode
}) {
  const t = useMessages(editor).inspector
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const found = INSPECTOR_TABS.find((item) => item === next)
        if (found) onTabChange(found)
      }}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="shrink-0 px-3.5 pt-3.5 pb-3">
        <TabsList aria-label={t.label} className="flex w-full flex-nowrap">
          {INSPECTOR_TABS.map((item) => (
            <TabsTrigger
              key={item}
              value={item}
              className="flex-1 px-1.5 text-[13.5px]"
            >
              {t.tabs[item]}
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
  const t = useMessages(editor).inspector.details
  return (
    <TabsContent value="details" className="grid gap-[18px]">
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-title`} className={FIELD_LABEL}>
            {t.title}
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
          {t.titleHelp}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-hook`} className={FIELD_LABEL}>
          {t.hook}
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
          {t.hookHelp}
        </p>
      </div>
      {(reason || score > 0) && (
        <div className={cn(INSET, "grid gap-2 p-3.5")}>
          <div className="flex items-center gap-2.5">
            <DotMeter
              value={Math.round(score * 10)}
              aria-label={t.score}
              tone="mint"
            />
            <b className="text-[13px] font-semibold">{t.why}</b>
            <span className="ms-auto font-mono text-xs text-tertiary tabular-nums">
              {t.scoreValue(score)}
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

export function CaptionsPanel({
  style,
  styleRef,
  onStyleRefChange,
  installedFonts,
  enabled,
  onEnabledChange,
  captions,
  onCaptionsChange,
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
  disabled?: boolean
}) {
  const id = React.useId()
  const t = useMessages(editor).inspector.captions
  const c = useMessages(common)
  const [editingStyle, setEditingStyle] = React.useState(false)
  const styleNames: Record<string, string> = t.styles
  const offsetSign =
    captions.offsetMs > 0 ? "+" : captions.offsetMs < 0 ? "−" : ""
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
          {styleNames[style.id] ?? style.label} ·{" "}
          {CAPTION_FONTS[style.font].label} · {t.words(style.maxWordsPerPage)}
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
          {editingStyle ? c.done : t.editStyle}
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
            {t.show}
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
            {t.timing}
          </span>
          <div
            role="group"
            aria-labelledby={`${id}-timing`}
            className="flex items-center gap-1"
          >
            <Button
              type="button"
              size="icon-xs"
              aria-label={t.earlier}
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
              {t.offset(offsetSign, Math.abs(captions.offsetMs) / 1000)}
            </output>
            <Button
              type="button"
              size="icon-xs"
              aria-label={t.later}
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
            {t.resetSpoken}
          </Button>
        )}
      </div>
      <p className={HELP}>{enabled ? t.help : t.off}</p>
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
  const t = useMessages(editor).inspector.layout
  return (
    <TabsContent value="layout" className="grid gap-[18px]">
      <div className={cn(INSET, "grid gap-3 px-3.5 py-3")}>
        <p className={HELP} aria-live="polite">
          {detecting
            ? t.detecting
            : hasWebcam
              ? t.withWebcam
              : layout.mode === "no-cam-fill"
                ? t.fill
                : t.fit}
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
          {t.findWebcam}
        </Button>
      </div>
      <div className="grid gap-2">
        <span id={`${id}-mode`} className="text-[13.5px] font-medium">
          {t.mode}
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
              {t.modes[item.value]}
            </SegmentedItem>
          ))}
        </Segmented>
        <p className={HELP}>{t.modeHelp[layout.mode]}</p>
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
