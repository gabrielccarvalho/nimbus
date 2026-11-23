"use client"

import * as React from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CAPTION_PRESETS } from "@/features/captions/styles"
import {
  NICHE_PROFILES,
  niches,
  type Niche,
} from "@/features/highlights/niches"
import type {
  ProjectSettings,
  RenderQuality,
  SelectorMode,
} from "@/features/projects/schema"

export const LANGUAGES = [
  { value: "auto", label: "Detect automatically" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
]

export function languageLabel(code: string) {
  return LANGUAGES.find((l) => l.value === code)?.label ?? code.toUpperCase()
}

const NICHES = niches.map((niche) => ({
  value: niche,
  label: niche === "auto" ? "Detect from title" : NICHE_PROFILES[niche].label,
}))

export const SELECTORS: {
  value: SelectorMode
  label: string
  description: string
}[] = [
  {
    value: "heuristic",
    label: "Heuristic",
    description: "Scores loudness, speech density and keywords locally.",
  },
  {
    value: "anthropic",
    label: "Claude",
    description: "Sends the transcript to Claude to pick and title clips.",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Gives you a prompt to paste into any chat, then the reply.",
  },
]

const QUALITIES: {
  value: RenderQuality
  label: string
  description: string
}[] = [
  { value: "draft", label: "Draft", description: "Smallest files, fastest." },
  { value: "standard", label: "Standard", description: "Good for uploads." },
  { value: "high", label: "High", description: "Larger files, sharper." },
]

type Shared = Pick<
  ProjectSettings,
  | "language"
  | "selectorMode"
  | "clipMinMs"
  | "clipMaxMs"
  | "targetClipCount"
  | "captionsEnabled"
  | "captionStyle"
  | "renderQuality"
  | "reactionPhrases"
  | "niche"
  | "autoEffects"
>

type FieldsProps<T extends Shared> = {
  value: T
  set: <K extends keyof T>(key: K, value: T[K]) => void
}

const seconds = (ms: number) => Math.round(ms / 1000)

export function LanguageField<T extends Shared>({
  value,
  set,
  englishOnlyModel,
  description,
}: FieldsProps<T> & { englishOnlyModel: boolean; description?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor="language">Spoken language</FieldLabel>
      <Select
        items={LANGUAGES}
        value={value.language}
        onValueChange={(next) => next && set("language", next as T["language"])}
      >
        <SelectTrigger id="language" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((language) => (
            <SelectItem key={language.value} value={language.value}>
              {language.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {englishOnlyModel
          ? "The configured Whisper model is English-only. Use a multilingual model for other languages."
          : (description ??
            "The language the streamer speaks, not the game's. Detection samples several points of the recording.")}
      </FieldDescription>
    </Field>
  )
}

export function HighlightFields<T extends Shared>({
  value,
  set,
  claudeAvailable,
}: FieldsProps<T> & { claudeAvailable: boolean }) {
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Selector</FieldLegend>
        <RadioGroup
          value={value.selectorMode}
          onValueChange={(next) =>
            set("selectorMode", next as T["selectorMode"])
          }
        >
          {SELECTORS.map((selector) => {
            const disabled = selector.value === "anthropic" && !claudeAvailable
            return (
              <FieldLabel
                key={selector.value}
                htmlFor={`selector-${selector.value}`}
              >
                <Field orientation="horizontal" data-disabled={disabled}>
                  <FieldContent>
                    <FieldTitle>{selector.label}</FieldTitle>
                    <FieldDescription>
                      {disabled
                        ? "Set ANTHROPIC_API_KEY in .env.local to use Claude."
                        : selector.description}
                    </FieldDescription>
                  </FieldContent>
                  <RadioGroupItem
                    id={`selector-${selector.value}`}
                    value={selector.value}
                    disabled={disabled}
                  />
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
      </FieldSet>
      <NicheField value={value} set={set} />
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="auto-effects">Auto effects</FieldLabel>
          <FieldDescription>
            Add full-cam, zoom and shake effects to the moments that call for
            them. You can edit them per clip.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="auto-effects"
          checked={value.autoEffects}
          onCheckedChange={(checked) =>
            set("autoEffects", checked as T["autoEffects"])
          }
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="clip-min">Shortest clip (s)</FieldLabel>
          <Input
            id="clip-min"
            type="number"
            min={5}
            max={180}
            value={seconds(value.clipMinMs)}
            aria-invalid={value.clipMinMs >= value.clipMaxMs}
            onChange={(event) =>
              set(
                "clipMinMs",
                (Number(event.target.value) * 1000) as T["clipMinMs"]
              )
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="clip-max">Longest clip (s)</FieldLabel>
          <Input
            id="clip-max"
            type="number"
            min={5}
            max={180}
            value={seconds(value.clipMaxMs)}
            onChange={(event) =>
              set(
                "clipMaxMs",
                (Number(event.target.value) * 1000) as T["clipMaxMs"]
              )
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="clip-count">Clips to find</FieldLabel>
          <Input
            id="clip-count"
            type="number"
            min={1}
            max={30}
            value={value.targetClipCount}
            onChange={(event) =>
              set(
                "targetClipCount",
                Number(event.target.value) as T["targetClipCount"]
              )
            }
          />
        </Field>
      </div>
      <CatchphrasesField value={value} set={set} />
    </FieldGroup>
  )
}

function NicheField<T extends Shared>({ value, set }: FieldsProps<T>) {
  return (
    <Field>
      <FieldLabel htmlFor="niche">Niche</FieldLabel>
      <Select
        items={NICHES}
        value={value.niche}
        onValueChange={(next) => next && set("niche", next as T["niche"])}
      >
        <SelectTrigger id="niche" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NICHES.map((niche) => (
            <SelectItem key={niche.value} value={niche.value}>
              {niche.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {value.niche === "auto"
          ? "Guessed from the recording's title. Tells Claude which moments hook viewers in this game."
          : NICHE_PROFILES[value.niche as Exclude<Niche, "auto">].description}
      </FieldDescription>
    </Field>
  )
}

function CatchphrasesField<T extends Shared>({ value, set }: FieldsProps<T>) {
  const [draft, setDraft] = React.useState(value.reactionPhrases.join("\n"))
  return (
    <Field>
      <FieldLabel htmlFor="catchphrases">Catchphrases</FieldLabel>
      <Textarea
        id="catchphrases"
        rows={3}
        value={draft}
        placeholder={"bora bill\nque isso, chat"}
        onChange={(event) => {
          setDraft(event.target.value)
          set(
            "reactionPhrases",
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean) as T["reactionPhrases"]
          )
        }}
      />
      <FieldDescription>
        One per line. Things the streamer says when something big happens, on
        top of the usual reactions for the spoken language. Used by the built-in
        selector.
      </FieldDescription>
    </Field>
  )
}

export function CaptionFields<T extends Shared>({
  value,
  set,
}: FieldsProps<T>) {
  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="captions-enabled">Burn in captions</FieldLabel>
          <FieldDescription>
            Word-by-word captions on vertical clips and the edit.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="captions-enabled"
          checked={value.captionsEnabled}
          onCheckedChange={(checked) =>
            set("captionsEnabled", checked as T["captionsEnabled"])
          }
        />
      </Field>
      <Field>
        <FieldLabel id="caption-style-label">Style</FieldLabel>
        <ToggleGroup
          aria-labelledby="caption-style-label"
          variant="outline"
          size="sm"
          value={[value.captionStyle.presetId]}
          onValueChange={(next) => {
            if (next[0]) {
              set("captionStyle", {
                presetId: next[0],
                overrides: {},
              } as T["captionStyle"])
            }
          }}
        >
          {CAPTION_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.id} value={preset.id}>
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  )
}

export function QualityField<T extends Shared>({ value, set }: FieldsProps<T>) {
  return (
    <FieldSet>
      <FieldLegend variant="label">Quality</FieldLegend>
      <RadioGroup
        value={value.renderQuality}
        onValueChange={(next) =>
          set("renderQuality", next as T["renderQuality"])
        }
        className="sm:grid-cols-3"
      >
        {QUALITIES.map((quality) => (
          <FieldLabel key={quality.value} htmlFor={`quality-${quality.value}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{quality.label}</FieldTitle>
                <FieldDescription>{quality.description}</FieldDescription>
              </FieldContent>
              <RadioGroupItem
                id={`quality-${quality.value}`}
                value={quality.value}
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
