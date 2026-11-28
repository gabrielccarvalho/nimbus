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
import { niches } from "@/features/highlights/niches"
import { privacyStatuses } from "@/features/publishing/schema"
import type { AppSettings } from "@/features/settings/schema"
import type {
  ProjectSettings,
  RenderQuality,
  SelectorMode,
} from "@/features/projects/schema"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { defaultLocale } from "@/lib/i18n/config"

import { LANGUAGES, languageLabel, languageOptions } from "./languages"
import { settings } from "./messages"

export { LANGUAGES, languageLabel, languageOptions }

const SELECTOR_MODES: SelectorMode[] = ["heuristic", "anthropic", "manual"]

// English only, for callers that haven't moved to settings.fields.selectors.
export const SELECTORS = SELECTOR_MODES.map((value) => ({
  value,
  ...settings[defaultLocale].fields.selectors[value],
}))

const QUALITIES: RenderQuality[] = ["draft", "standard", "high"]

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
  transcriptionOff,
  description,
}: FieldsProps<T> & { transcriptionOff: boolean; description?: string }) {
  const t = useMessages(settings).fields
  const languages = languageOptions(useLocale())
  return (
    <Field>
      <FieldLabel htmlFor="language">{t.language}</FieldLabel>
      <Select
        items={languages}
        value={value.language}
        onValueChange={(next) => next && set("language", next as T["language"])}
      >
        <SelectTrigger id="language" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.value} value={language.value}>
              {language.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {transcriptionOff
          ? t.transcriptionOff
          : (description ?? t.languageHint)}
      </FieldDescription>
    </Field>
  )
}

export function HighlightFields<T extends Shared>({
  value,
  set,
  claudeAvailable,
}: FieldsProps<T> & { claudeAvailable: boolean }) {
  const t = useMessages(settings).fields
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">{t.selector}</FieldLegend>
        <RadioGroup
          className="sm:grid-cols-3"
          value={value.selectorMode}
          onValueChange={(next) =>
            set("selectorMode", next as T["selectorMode"])
          }
        >
          {SELECTOR_MODES.map((mode) => {
            const disabled = mode === "anthropic" && !claudeAvailable
            return (
              <FieldLabel key={mode} htmlFor={`selector-${mode}`}>
                <Field orientation="horizontal" data-disabled={disabled}>
                  <FieldContent>
                    <FieldTitle>{t.selectors[mode].label}</FieldTitle>
                    <FieldDescription>
                      {disabled
                        ? t.claudeKeyMissing
                        : t.selectors[mode].description}
                    </FieldDescription>
                  </FieldContent>
                  <RadioGroupItem
                    id={`selector-${mode}`}
                    value={mode}
                    disabled={disabled}
                  />
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
      </FieldSet>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="clip-min">{t.clipMin}</FieldLabel>
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
          <FieldLabel htmlFor="clip-max">{t.clipMax}</FieldLabel>
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
          <FieldLabel htmlFor="clip-count">{t.clipCount}</FieldLabel>
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
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="auto-effects">{t.autoEffects}</FieldLabel>
          <FieldDescription>{t.autoEffectsHint}</FieldDescription>
        </FieldContent>
        <Switch
          id="auto-effects"
          checked={value.autoEffects}
          onCheckedChange={(checked) =>
            set("autoEffects", checked as T["autoEffects"])
          }
        />
      </Field>
    </FieldGroup>
  )
}

export function NicheField<T extends Shared>({ value, set }: FieldsProps<T>) {
  const t = useMessages(settings).fields
  const options = niches.map((niche) => ({
    value: niche,
    label: t.niches[niche].label,
  }))
  return (
    <Field>
      <FieldLabel htmlFor="niche">{t.niche}</FieldLabel>
      <Select
        items={options}
        value={value.niche}
        onValueChange={(next) => next && set("niche", next as T["niche"])}
      >
        <SelectTrigger id="niche" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((niche) => (
            <SelectItem key={niche.value} value={niche.value}>
              {niche.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t.niches[value.niche].description}</FieldDescription>
    </Field>
  )
}

function CatchphrasesField<T extends Shared>({ value, set }: FieldsProps<T>) {
  const t = useMessages(settings).fields
  const [draft, setDraft] = React.useState(value.reactionPhrases.join("\n"))
  return (
    <Field>
      <FieldLabel htmlFor="catchphrases">{t.catchphrases}</FieldLabel>
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
      <FieldDescription>{t.catchphrasesHint}</FieldDescription>
    </Field>
  )
}

export function CaptionFields<T extends Shared>({
  value,
  set,
}: FieldsProps<T>) {
  const t = useMessages(settings).fields
  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="captions-enabled">{t.burnIn}</FieldLabel>
          <FieldDescription>{t.burnInHint}</FieldDescription>
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
        <FieldLabel id="caption-style-label">{t.captionStyle}</FieldLabel>
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
              {t.captionPresets[preset.id] ?? preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  )
}

export function QualityField<T extends Shared>({ value, set }: FieldsProps<T>) {
  const t = useMessages(settings).fields
  return (
    <FieldSet>
      <FieldLegend variant="label">{t.quality}</FieldLegend>
      <RadioGroup
        value={value.renderQuality}
        onValueChange={(next) =>
          set("renderQuality", next as T["renderQuality"])
        }
        className="sm:grid-cols-3"
      >
        {QUALITIES.map((quality) => (
          <FieldLabel key={quality} htmlFor={`quality-${quality}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t.qualities[quality].label}</FieldTitle>
                <FieldDescription>
                  {t.qualities[quality].description}
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem id={`quality-${quality}`} value={quality} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}

export function PublishingFields({
  value,
  set,
}: {
  value: AppSettings
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const t = useMessages(settings).fields
  const privacyOptions = privacyStatuses.map((status) => ({
    value: status,
    label: t.privacyOptions[status],
  }))
  const [tags, setTags] = React.useState(value.publishTags.join(", "))
  return (
    <FieldSet>
      <FieldLegend variant="label">{t.publishing}</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="publish-privacy">{t.privacy}</FieldLabel>
          <Select
            items={privacyOptions}
            value={value.publishPrivacy}
            onValueChange={(next) =>
              next &&
              set("publishPrivacy", next as AppSettings["publishPrivacy"])
            }
          >
            <SelectTrigger id="publish-privacy" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {privacyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t.privacyHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="publish-tags">{t.tags}</FieldLabel>
          <Input
            id="publish-tags"
            value={tags}
            placeholder="fps, clutch"
            onChange={(event) => {
              setTags(event.target.value)
              set(
                "publishTags",
                event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              )
            }}
          />
          <FieldDescription>{t.tagsHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="publish-hashtags">{t.hashtags}</FieldLabel>
          <Input
            id="publish-hashtags"
            value={value.publishHashtags}
            maxLength={200}
            onChange={(event) => set("publishHashtags", event.target.value)}
          />
          <FieldDescription>{t.hashtagsHint}</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
