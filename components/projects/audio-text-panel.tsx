"use client"

import * as React from "react"

import { ArrowSquareOutIcon, YoutubeLogoIcon } from "@phosphor-icons/react"

import { MusicUploadButton } from "@/components/music/music-upload-button"
import { TrackPicker } from "@/components/music/track-picker"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import {
  DEFAULT_OVERLAY_UNTIL_MS,
  defaultOverlayText,
  TEXT_OVERLAY_MAX_CHARS,
  textOverlaySchema,
  type TextOverlay,
} from "@/features/captions/overlay"
import {
  DEFAULT_AUDIO_MIX,
  FADE_MAX_MS,
  MUSIC_DB,
  SOURCE_DB,
  type AudioMix,
  type MusicTrackSummary,
  type ReadyMusicTrack,
  type TrendingMusic as TrendingMusicResult,
  youtubeWatchUrl,
} from "@/features/music/schema"
import { formatDuration } from "@/lib/format"

const TRACK_STEP_MS = 100

const seconds = (ms: number) => (ms / 1000).toFixed(1)
const secondsToMs = (value: string, maxMs: number, minMs = 0) =>
  Math.round(Math.min(maxMs, Math.max(minMs, (Number(value) || 0) * 1000)))
const sliderValue = (value: number | readonly number[]) =>
  Array.isArray(value) ? value[0] : (value as number)
const decibels = (_: string, value: number) => `${value} dB`

function VolumeField({
  label,
  value,
  min,
  max,
  disabled,
  onValueChange,
}: {
  label: string
  value: number
  min: number
  max: number
  disabled: boolean
  onValueChange: (value: number) => void
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
        min={min}
        max={max}
        step={1}
        value={[value]}
        disabled={disabled}
        getAriaValueText={decibels}
        onValueChange={(next) => {
          const db = sliderValue(next)
          if (db !== undefined) onValueChange(db)
        }}
      />
    </div>
  )
}

export function AudioTextPanel({
  audioMix,
  onAudioMixChange,
  textOverlay,
  onTextOverlayChange,
  tracks,
  trending,
  clipDurationMs,
  hook,
  title,
  captionsNearTop,
  previewUnavailable,
  disabled,
}: {
  audioMix: AudioMix | null
  onAudioMixChange: (mix: AudioMix | null) => void
  textOverlay: TextOverlay | null
  onTextOverlayChange: (overlay: TextOverlay | null) => void
  tracks: MusicTrackSummary[]
  trending: Promise<TrendingMusicResult>
  clipDurationMs: number
  hook: string
  title: string
  captionsNearTop: boolean
  previewUnavailable: boolean
  disabled: boolean
}) {
  const id = React.useId()
  const [uploads, setUploads] = React.useState<MusicTrackSummary[]>([])
  const library = React.useMemo(
    () => [
      ...tracks,
      ...uploads.filter((upload) => !tracks.some((t) => t.id === upload.id)),
    ],
    [tracks, uploads]
  )
  const mix = audioMix ?? DEFAULT_AUDIO_MIX
  const selected = library.find((t) => t.id === audioMix?.trackId)
  const track = selected?.status === "ready" ? selected : undefined
  const editMix = (patch: Partial<AudioMix>) =>
    onAudioMixChange({ ...mix, ...patch })

  const sound = audioMix?.youtubeSound ?? null

  const selectTrack = (next: ReadyMusicTrack | null) => {
    if (!next) {
      if (audioMix) editMix({ trackId: null, youtubeSound: null })
      return
    }
    editMix({
      trackId: next.id,
      trackStartMs: mix.trackStartMs < next.durationMs ? mix.trackStartMs : 0,
      youtubeSound: null,
    })
  }

  const remainingMs = track ? track.durationMs - mix.trackStartMs : 0
  const shortByMs = clipDurationMs - remainingMs
  const editOverlay = (patch: Partial<TextOverlay>) =>
    textOverlay && onTextOverlayChange({ ...textOverlay, ...patch })
  const overlayTextError =
    textOverlay &&
    textOverlaySchema.shape.text.safeParse(textOverlay.text).error?.issues[0]
      ?.message

  return (
    <div className="grid gap-6">
      <section className="grid gap-4" aria-labelledby={`${id}-music`}>
        <h3
          id={`${id}-music`}
          className="text-[15px] font-semibold tracking-[-0.015em]"
        >
          Music
        </h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${id}-track`}>Track</Label>
            <MusicUploadButton
              size="sm"
              disabled={disabled}
              onUploaded={(upload) =>
                setUploads((current) => [...current, upload])
              }
            />
          </div>
          <TrackPicker
            id={`${id}-track`}
            library={library}
            trending={trending}
            disabled={disabled}
            value={
              sound
                ? { kind: "youtube", sound }
                : selected
                  ? { kind: "track", id: selected.id }
                  : { kind: "none" }
            }
            onValueChange={(choice) => {
              if (choice.kind === "youtube") {
                editMix({ trackId: null, youtubeSound: choice.sound })
                return
              }
              const next =
                choice.kind === "track"
                  ? library.find((t) => t.id === choice.id)
                  : undefined
              selectTrack(next?.status === "ready" ? next : null)
            }}
          />
        </div>
        {sound && (
          <div className="flex flex-col gap-2">
            <Item
              variant="outline"
              size="sm"
              render={
                <a
                  href={youtubeWatchUrl(sound.videoId)}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ItemMedia variant="image">
                {sound.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
                  <img src={sound.thumbnailUrl} alt="" />
                ) : (
                  <YoutubeLogoIcon aria-hidden />
                )}
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-1">{sound.title}</ItemTitle>
                <ItemDescription className="line-clamp-1">
                  {sound.channelTitle}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ArrowSquareOutIcon aria-label="Opens YouTube" />
              </ItemActions>
            </Item>
            <p className="text-[13px] text-tertiary">
              Sound to add in the YouTube app. The render keeps the original
              audio: download the clip, upload it from the YouTube app and pick
              this song with Add sound. Set the song&apos;s volume there; the
              original audio volume below still applies to the render.
            </p>
          </div>
        )}
        {previewUnavailable && (
          <p className="text-[13px] text-amber">
            This browser can&apos;t play the music preview. The render will
            still include it.
          </p>
        )}
        {track && (
          <>
            <div className="flex flex-col gap-2">
              <Label id={`${id}-start`}>Start in track</Label>
              <Timeline
                aria-labelledby={`${id}-start`}
                durationMs={track.durationMs}
                value={mix.trackStartMs}
                step={TRACK_STEP_MS}
                readOnly={disabled}
                onValueChange={(ms) =>
                  editMix({
                    trackStartMs: Math.min(
                      ms,
                      Math.max(0, track.durationMs - TRACK_STEP_MS)
                    ),
                  })
                }
              >
                <TimelineLoudness values={track.peaks} />
                <TimelineRange
                  variant="selected"
                  startMs={mix.trackStartMs}
                  endMs={Math.min(
                    track.durationMs,
                    mix.trackStartMs + clipDurationMs
                  )}
                />
              </Timeline>
              <p className="text-[13px] text-tertiary">
                Starts at {formatDuration(mix.trackStartMs)} of{" "}
                {formatDuration(track.durationMs)}
                {shortByMs > 0 &&
                  `. The track ends ${seconds(shortByMs)} s before the clip, so the music fades out early.`}
              </p>
            </div>
            <VolumeField
              label="Music volume"
              value={mix.musicDb}
              min={MUSIC_DB.min}
              max={MUSIC_DB.max}
              disabled={disabled}
              onValueChange={(musicDb) => editMix({ musicDb })}
            />
          </>
        )}
        <div className="flex flex-col gap-2">
          <VolumeField
            label="Original audio volume"
            value={mix.sourceDb}
            min={SOURCE_DB.min}
            max={SOURCE_DB.max}
            disabled={disabled}
            onValueChange={(sourceDb) => editMix({ sourceDb })}
          />
          <p className="text-[13px] text-tertiary">
            Turn the game and voice up or down. 0 dB keeps them as recorded.
          </p>
        </div>
        {track && (
          <>
            <div className="flex items-center gap-2.5">
              <Switch
                id={`${id}-duck`}
                checked={mix.duck}
                disabled={disabled}
                onCheckedChange={(duck) => editMix({ duck })}
              />
              <Label htmlFor={`${id}-duck`}>
                Lower the music while someone talks
              </Label>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="grid flex-[1_1_140px] gap-2">
                <Label htmlFor={`${id}-fade-in`}>Fade in (seconds)</Label>
                <Input
                  id={`${id}-fade-in`}
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0}
                  max={FADE_MAX_MS / 1000}
                  className="font-mono"
                  value={seconds(mix.fadeInMs)}
                  disabled={disabled}
                  onChange={(event) =>
                    editMix({
                      fadeInMs: secondsToMs(event.target.value, FADE_MAX_MS),
                    })
                  }
                />
              </div>
              <div className="grid flex-[1_1_140px] gap-2">
                <Label htmlFor={`${id}-fade-out`}>Fade out (seconds)</Label>
                <Input
                  id={`${id}-fade-out`}
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0}
                  max={FADE_MAX_MS / 1000}
                  className="font-mono"
                  value={seconds(mix.fadeOutMs)}
                  disabled={disabled}
                  onChange={(event) =>
                    editMix({
                      fadeOutMs: secondsToMs(event.target.value, FADE_MAX_MS),
                    })
                  }
                />
              </div>
            </div>
          </>
        )}
      </section>

      <section
        className="grid gap-4 pt-5 shadow-[inset_0_1px_0_var(--hair)]"
        aria-labelledby={`${id}-text`}
      >
        <h3
          id={`${id}-text`}
          className="text-[15px] font-semibold tracking-[-0.015em]"
        >
          Text on screen
        </h3>
        <div className="flex items-center gap-2.5">
          <Switch
            id={`${id}-overlay`}
            checked={textOverlay !== null}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onTextOverlayChange(
                checked
                  ? {
                      text: defaultOverlayText(hook, title),
                      position: "top",
                      untilMs: DEFAULT_OVERLAY_UNTIL_MS,
                    }
                  : null
              )
            }
          />
          <Label htmlFor={`${id}-overlay`}>Show text on the video</Label>
        </div>
        {textOverlay && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${id}-overlay-text`}>Text</Label>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {textOverlay.text.length}/{TEXT_OVERLAY_MAX_CHARS}
                </span>
              </div>
              <Input
                id={`${id}-overlay-text`}
                value={textOverlay.text}
                maxLength={TEXT_OVERLAY_MAX_CHARS}
                required
                aria-invalid={Boolean(overlayTextError)}
                aria-describedby={
                  overlayTextError ? `${id}-overlay-text-error` : undefined
                }
                disabled={disabled}
                onChange={(event) => editOverlay({ text: event.target.value })}
              />
              {overlayTextError && (
                <FieldError id={`${id}-overlay-text-error`}>
                  {overlayTextError}
                </FieldError>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label id={`${id}-position`}>Position</Label>
              <RadioGroup
                aria-labelledby={`${id}-position`}
                value={textOverlay.position}
                disabled={disabled}
                onValueChange={(value) =>
                  editOverlay({
                    position: value === "center" ? "center" : "top",
                  })
                }
                className="flex flex-wrap gap-4"
              >
                {(
                  [
                    ["top", "Top"],
                    ["center", "Center"],
                  ] as const
                ).map(([value, label]) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={`${id}-position-${value}`}
                      value={value}
                    />
                    <Label htmlFor={`${id}-position-${value}`}>{label}</Label>
                  </div>
                ))}
              </RadioGroup>
              {captionsNearTop && textOverlay.position === "top" && (
                <p className="text-[13px] text-amber">
                  Your captions sit near the top too. Move them or put the text
                  in the center.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label id={`${id}-until`}>On screen</Label>
              <RadioGroup
                aria-labelledby={`${id}-until`}
                value={textOverlay.untilMs === null ? "whole" : "first"}
                disabled={disabled}
                onValueChange={(value) =>
                  editOverlay({
                    untilMs:
                      value === "whole" ? null : DEFAULT_OVERLAY_UNTIL_MS,
                  })
                }
                className="flex flex-wrap gap-4"
              >
                {(
                  [
                    ["first", "First seconds"],
                    ["whole", "Whole clip"],
                  ] as const
                ).map(([value, label]) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem id={`${id}-until-${value}`} value={value} />
                    <Label htmlFor={`${id}-until-${value}`}>{label}</Label>
                  </div>
                ))}
              </RadioGroup>
              {textOverlay.untilMs !== null && (
                <div className="grid max-w-40 gap-2">
                  <Label htmlFor={`${id}-seconds`}>Seconds</Label>
                  <Input
                    id={`${id}-seconds`}
                    type="number"
                    inputMode="decimal"
                    step={0.5}
                    min={0.5}
                    max={180}
                    className="font-mono"
                    value={seconds(textOverlay.untilMs)}
                    disabled={disabled}
                    onChange={(event) =>
                      editOverlay({
                        untilMs: secondsToMs(event.target.value, 180_000, 500),
                      })
                    }
                  />
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
