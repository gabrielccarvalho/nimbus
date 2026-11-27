"use client"

import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  TEXT_OVERLAY_MAX_CHARS,
  textOverlaySchema,
  type TextOverlay,
} from "@/features/captions/overlay"
import { CAPTION_TEXT_MAX, captionItemSchema } from "@/features/clips/schema"
import type { Effect } from "@/features/effects/schema"
import {
  FADE_MAX_MS,
  MUSIC_DB,
  SOURCE_DB,
  type AudioMix,
  type MusicClip,
  type ReadyMusicTrack,
} from "@/features/music/schema"
import { formatDuration, formatTimestamp, parseTimestamp } from "@/lib/format"
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { editor, type EditorMessages } from "./messages/editor"

const TRACK_STEP_MS = 100
const SHAKE_INTENSITIES = ["light", "strong"] as const
const POSITIONS = ["top", "center"] as const

const seconds = (ms: number) => (ms / 1000).toFixed(1)
const secondsToMs = (value: string, maxMs: number) =>
  Math.round(Math.min(maxMs, Math.max(0, (Number(value) || 0) * 1000)))
const first = (value: number | readonly number[]) =>
  Array.isArray(value) ? value[0] : (value as number)
const decibels = (_: string, value: number) => `${value} dB`

function Times({ startMs, endMs }: { startMs: number; endMs: number }) {
  return (
    <PopoverDescription className="font-mono tabular-nums">
      {formatTimestamp(startMs)} → {formatTimestamp(endMs)}
    </PopoverDescription>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const c = useMessages(common)
  return (
    <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
      <TrashIcon data-icon="inline-start" aria-hidden />
      {c.delete}
    </Button>
  )
}

function VolumeSlider({
  label,
  value,
  range,
  disabled,
  onValueChange,
}: {
  label: string
  value: number
  range: { min: number; max: number }
  disabled?: boolean
  onValueChange: (db: number) => void
}) {
  const id = React.useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label id={id}>{label}</Label>
        <span className="font-mono text-xs tabular-nums">{value} dB</span>
      </div>
      <Slider
        aria-labelledby={id}
        min={range.min}
        max={range.max}
        step={1}
        value={[value]}
        disabled={disabled}
        getAriaValueText={decibels}
        onValueChange={(next) => {
          const db = first(next)
          if (db !== undefined) onValueChange(db)
        }}
      />
    </div>
  )
}

function SecondsField({
  label,
  valueMs,
  maxMs,
  onValueChange,
}: {
  label: string
  valueMs: number
  maxMs: number
  onValueChange: (ms: number) => void
}) {
  const id = React.useId()
  return (
    <div className="grid flex-1 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0}
        max={maxMs / 1000}
        className="h-8 font-mono"
        value={seconds(valueMs)}
        onChange={(event) =>
          onValueChange(secondsToMs(event.target.value, maxMs))
        }
      />
    </div>
  )
}

export function effectLabel(effect: Effect, t: EditorMessages["effects"]) {
  if (effect.kind === "zoom") return t.zoom
  if (effect.kind === "shake") return t.shake
  return effect.target === "game" ? t.game : t.cam
}

export function EffectInspector({
  effect,
  clipStartMs,
  hasWebcam,
  onChange,
  onDelete,
}: {
  effect: Effect
  clipStartMs: number
  hasWebcam: boolean
  onChange: (effect: Effect) => void
  onDelete: () => void
}) {
  const id = React.useId()
  const { item: t, effects } = useMessages(editor)
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{effectLabel(effect, effects)}</PopoverTitle>
        <Times
          startMs={effect.startMs - clipStartMs}
          endMs={effect.endMs - clipStartMs}
        />
        {effect.kind === "zoom" && (
          <PopoverDescription>{t.focusHint}</PopoverDescription>
        )}
        {effect.kind === "focus" && !hasWebcam && (
          <PopoverDescription>{t.noWebcam}</PopoverDescription>
        )}
      </PopoverHeader>
      {effect.kind === "zoom" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label id={`${id}-scale`}>{t.strength}</Label>
            <span className="font-mono text-xs tabular-nums">
              {effects.scale(effect.scale)}
            </span>
          </div>
          <Slider
            aria-labelledby={`${id}-scale`}
            min={1.1}
            max={2}
            step={0.1}
            value={[effect.scale]}
            onValueChange={(next) => {
              const scale = first(next)
              if (scale !== undefined)
                onChange({ ...effect, scale: Math.round(scale * 10) / 10 })
            }}
          />
        </div>
      )}
      {effect.kind === "shake" && (
        <div className="flex flex-col gap-2">
          <Label id={`${id}-intensity`}>{t.intensity}</Label>
          <ToggleGroup
            aria-labelledby={`${id}-intensity`}
            variant="outline"
            size="sm"
            value={[effect.intensity]}
            onValueChange={(value) => {
              const intensity = SHAKE_INTENSITIES.find(
                (option) => option === value[0]
              )
              if (intensity) onChange({ ...effect, intensity })
            }}
          >
            {SHAKE_INTENSITIES.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {effects.intensities[option]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <DeleteButton onDelete={onDelete} />
    </>
  )
}

export function CaptionInspector({
  title,
  text,
  startMs,
  endMs,
  edited,
  onTextChange,
  onReset,
  onDelete,
}: {
  title: string
  text: string
  startMs: number
  endMs: number
  edited: boolean
  onTextChange: (text: string) => void
  onReset?: () => void
  onDelete: () => void
}) {
  const id = React.useId()
  const t = useMessages(editor).item
  const [draft, setDraft] = React.useState(text)
  const issue = captionItemSchema.shape.text.safeParse(draft).error?.issues[0]
  const error = issue?.code === "too_small" ? t.captionRequired : issue?.message
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
        <Times startMs={startMs} endMs={endMs} />
      </PopoverHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-text`}>{t.captionText}</Label>
        <Input
          id={`${id}-text`}
          value={draft}
          maxLength={CAPTION_TEXT_MAX}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) onTextChange(event.target.value)
          }}
        />
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </div>
      <div className="flex flex-wrap gap-2">
        {edited && onReset && (
          <Button type="button" size="sm" onClick={onReset}>
            <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
            {t.resetCaption}
          </Button>
        )}
        <DeleteButton onDelete={onDelete} />
      </div>
    </>
  )
}

export function TextInspector({
  overlay,
  captionsNearTop,
  onChange,
  onDelete,
}: {
  overlay: TextOverlay
  captionsNearTop: boolean
  onChange: (overlay: TextOverlay) => void
  onDelete: () => void
}) {
  const id = React.useId()
  const t = useMessages(editor).item
  const issue = textOverlaySchema.shape.text.safeParse(overlay.text).error
    ?.issues[0]
  const error = issue?.code === "too_small" ? t.textRequired : issue?.message
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{t.textTitle}</PopoverTitle>
        <Times startMs={overlay.startMs} endMs={overlay.endMs} />
      </PopoverHeader>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-text`}>{t.text}</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {overlay.text.length}/{TEXT_OVERLAY_MAX_CHARS}
          </span>
        </div>
        <Input
          id={`${id}-text`}
          value={overlay.text}
          maxLength={TEXT_OVERLAY_MAX_CHARS}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) =>
            onChange({ ...overlay, text: event.target.value })
          }
        />
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label id={`${id}-position`}>{t.position}</Label>
        <ToggleGroup
          aria-labelledby={`${id}-position`}
          variant="outline"
          size="sm"
          value={[overlay.position]}
          onValueChange={(next) => {
            const position = POSITIONS.find((p) => p === next[0])
            if (position) onChange({ ...overlay, position })
          }}
        >
          {POSITIONS.map((position) => (
            <ToggleGroupItem key={position} value={position}>
              {t.positions[position]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {captionsNearTop && overlay.position === "top" && (
          <p className="text-[13px] text-amber">{t.captionsNearTop}</p>
        )}
      </div>
      <DeleteButton onDelete={onDelete} />
    </>
  )
}

export function MusicInspector({
  clip,
  track,
  duck,
  onChange,
  onDuckChange,
  onDelete,
}: {
  clip: MusicClip
  track: ReadyMusicTrack | undefined
  duck: boolean
  onChange: (clip: MusicClip) => void
  onDuckChange: (duck: boolean) => void
  onDelete: () => void
}) {
  const id = React.useId()
  const t = useMessages(editor).item
  const lengthMs = clip.endMs - clip.startMs
  return (
    <>
      <PopoverHeader>
        <PopoverTitle className="line-clamp-1">
          {track?.title ?? t.music}
        </PopoverTitle>
        <Times startMs={clip.startMs} endMs={clip.endMs} />
      </PopoverHeader>
      <VolumeSlider
        label={t.musicVolume}
        value={clip.db}
        range={MUSIC_DB}
        onValueChange={(db) => onChange({ ...clip, db })}
      />
      {track && (
        <div className="flex flex-col gap-2">
          <Label id={`${id}-in`}>{t.startInSong}</Label>
          <Timeline
            aria-labelledby={`${id}-in`}
            durationMs={track.durationMs}
            value={clip.inMs}
            step={TRACK_STEP_MS}
            onValueChange={(ms) =>
              onChange({
                ...clip,
                inMs: Math.min(
                  ms,
                  Math.max(0, track.durationMs - TRACK_STEP_MS)
                ),
              })
            }
          >
            <TimelineLoudness values={track.peaks} />
            <TimelineRange
              variant="selected"
              startMs={clip.inMs}
              endMs={Math.min(track.durationMs, clip.inMs + lengthMs)}
            />
          </Timeline>
          <p className="text-[13px] text-tertiary">
            {t.playsFrom(
              formatDuration(clip.inMs),
              formatDuration(track.durationMs)
            )}
          </p>
        </div>
      )}
      <div className="flex gap-3">
        <SecondsField
          label={t.fadeIn}
          valueMs={clip.fadeInMs}
          maxMs={FADE_MAX_MS}
          onValueChange={(fadeInMs) => onChange({ ...clip, fadeInMs })}
        />
        <SecondsField
          label={t.fadeOut}
          valueMs={clip.fadeOutMs}
          maxMs={FADE_MAX_MS}
          onValueChange={(fadeOutMs) => onChange({ ...clip, fadeOutMs })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-duck`}
          checked={duck}
          onCheckedChange={onDuckChange}
        />
        <Label htmlFor={`${id}-duck`}>{t.duck}</Label>
      </div>
      <DeleteButton onDelete={onDelete} />
    </>
  )
}

export function SourceInspector({
  mix,
  onChange,
}: {
  mix: AudioMix
  onChange: (mix: AudioMix) => void
}) {
  const id = React.useId()
  const { item: t, tracks } = useMessages(editor)
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{t.originalAudio}</PopoverTitle>
        <PopoverDescription>{t.originalAudioHelp}</PopoverDescription>
      </PopoverHeader>
      <VolumeSlider
        label={t.originalVolume}
        value={mix.sourceDb}
        range={SOURCE_DB}
        disabled={mix.sourceMuted}
        onValueChange={(sourceDb) => onChange({ ...mix, sourceDb })}
      />
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-mute`}
          checked={mix.sourceMuted}
          onCheckedChange={(sourceMuted) => onChange({ ...mix, sourceMuted })}
        />
        <Label htmlFor={`${id}-mute`}>{tracks.muteOriginal}</Label>
      </div>
    </>
  )
}

export function VideoInspector({
  startMs,
  endMs,
  onTrim,
}: {
  startMs: number
  endMs: number
  onTrim: (startMs: number, endMs: number) => void
}) {
  const id = React.useId()
  const t = useMessages(editor).item
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{t.clip}</PopoverTitle>
        <PopoverDescription>
          {t.clipHelp((endMs - startMs) / 1000)}
        </PopoverDescription>
      </PopoverHeader>
      <div className="flex gap-3">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={`${id}-start`}>{t.start}</Label>
          <Input
            id={`${id}-start`}
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            className="h-8 font-mono"
            value={seconds(startMs)}
            onChange={(event) =>
              onTrim(Number(event.target.value) * 1000, endMs)
            }
          />
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={`${id}-end`}>{t.end}</Label>
          <Input
            id={`${id}-end`}
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            className="h-8 font-mono"
            value={seconds(endMs)}
            onChange={(event) =>
              onTrim(startMs, Number(event.target.value) * 1000)
            }
          />
        </div>
      </div>
    </>
  )
}

function TimestampField({
  label,
  valueMs,
  onCommit,
}: {
  label: string
  valueMs: number
  onCommit: (ms: number) => void
}) {
  const id = React.useId()
  const [draft, setDraft] = React.useState<string | null>(null)
  const commit = () => {
    const ms = draft === null ? null : parseTimestamp(draft)
    setDraft(null)
    if (ms !== null && ms !== valueMs) onCommit(ms)
  }
  return (
    <div className="grid flex-1 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        className="h-8 font-mono"
        value={draft ?? formatTimestamp(valueMs)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
      />
    </div>
  )
}

export function PartInspector({
  index,
  count,
  part,
  onChange,
  onMove,
  onAdd,
  onDelete,
}: {
  index: number
  count: number
  part: { startMs: number; endMs: number }
  onChange: (part: { startMs: number; endMs: number }) => void
  onMove: (to: number) => void
  onAdd: () => void
  onDelete: () => void
}) {
  const t = useMessages(editor).item
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{t.partOf(index + 1, count)}</PopoverTitle>
        <PopoverDescription>
          {t.partHelp((part.endMs - part.startMs) / 1000)}
        </PopoverDescription>
      </PopoverHeader>
      <div className="flex gap-3">
        <TimestampField
          label={t.from}
          valueMs={part.startMs}
          onCommit={(startMs) => onChange({ ...part, startMs })}
        />
        <TimestampField
          label={t.to}
          valueMs={part.endMs}
          onCommit={(endMs) => onChange({ ...part, endMs })}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          {t.earlier}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          {t.later}
          <ArrowRightIcon data-icon="inline-end" aria-hidden />
        </Button>
        <Button type="button" size="sm" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          {t.addPart}
        </Button>
        {count > 1 && <DeleteButton onDelete={onDelete} />}
      </div>
    </>
  )
}
