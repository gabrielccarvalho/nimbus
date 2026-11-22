"use client"

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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CAPTION_PRESETS } from "@/features/captions/styles"
import type { SelectorMode } from "@/features/projects/schema"
import { saveSettingsAction } from "@/features/settings/actions"
import type { AppSettings, RenderQuality } from "@/features/settings/schema"

const LANGUAGES = [
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

const SELECTORS: {
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

const seconds = (ms: number) => Math.round(ms / 1000)

export function SettingsForm({
  initial,
  claudeAvailable,
  hardwareEncoder,
  englishOnlyModel,
}: {
  initial: AppSettings
  claudeAvailable: boolean
  hardwareEncoder: string | null
  englishOnlyModel: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [settings, setSettings] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveSettingsAction(settings)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setError(null)
      toast.success("Settings saved")
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="language">Language</FieldLabel>
            <Select
              items={LANGUAGES}
              value={settings.transcriptionLanguage}
              onValueChange={(value) =>
                value && set("transcriptionLanguage", value)
              }
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
            {englishOnlyModel && (
              <FieldDescription>
                The configured Whisper model is English-only. Use a multilingual
                model for other languages.
              </FieldDescription>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Highlights</CardTitle>
          <CardDescription>Defaults for new projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Selector</FieldLegend>
              <RadioGroup
                value={settings.selectorMode}
                onValueChange={(value) =>
                  set("selectorMode", value as SelectorMode)
                }
              >
                {SELECTORS.map((selector) => {
                  const disabled =
                    selector.value === "anthropic" && !claudeAvailable
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="clip-min">Shortest clip (s)</FieldLabel>
                <Input
                  id="clip-min"
                  type="number"
                  min={5}
                  max={180}
                  value={seconds(settings.clipMinMs)}
                  aria-invalid={settings.clipMinMs >= settings.clipMaxMs}
                  onChange={(event) =>
                    set("clipMinMs", Number(event.target.value) * 1000)
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
                  value={seconds(settings.clipMaxMs)}
                  onChange={(event) =>
                    set("clipMaxMs", Number(event.target.value) * 1000)
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
                  value={settings.targetClipCount}
                  onChange={(event) =>
                    set("targetClipCount", Number(event.target.value))
                  }
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captions</CardTitle>
          <CardDescription>Defaults for new projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="captions-enabled">
                  Burn in captions
                </FieldLabel>
                <FieldDescription>
                  Word-by-word captions on vertical clips and the edit.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="captions-enabled"
                checked={settings.captionsEnabled}
                onCheckedChange={(checked) => set("captionsEnabled", checked)}
              />
            </Field>
            <Field>
              <FieldLabel id="caption-style-label">Style</FieldLabel>
              <ToggleGroup
                aria-labelledby="caption-style-label"
                variant="outline"
                size="sm"
                value={[settings.captionStyle.presetId]}
                onValueChange={(value) => {
                  if (value[0])
                    set("captionStyle", { presetId: value[0], overrides: {} })
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendering</CardTitle>
          <CardDescription>
            Applies to every render from now on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Quality</FieldLegend>
              <RadioGroup
                value={settings.renderQuality}
                onValueChange={(value) =>
                  set("renderQuality", value as RenderQuality)
                }
                className="sm:grid-cols-3"
              >
                {QUALITIES.map((quality) => (
                  <FieldLabel
                    key={quality.value}
                    htmlFor={`quality-${quality.value}`}
                  >
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{quality.label}</FieldTitle>
                        <FieldDescription>
                          {quality.description}
                        </FieldDescription>
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
            <Field orientation="horizontal" data-disabled={!hardwareEncoder}>
              <FieldContent>
                <FieldLabel htmlFor="hardware-encoding">
                  Hardware encoding
                </FieldLabel>
                <FieldDescription>
                  {hardwareEncoder
                    ? `Faster renders with ${hardwareEncoder}. Output can differ slightly between machines.`
                    : "No hardware encoder found in this ffmpeg."}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="hardware-encoding"
                checked={settings.hardwareEncoding && Boolean(hardwareEncoder)}
                disabled={!hardwareEncoder}
                onCheckedChange={(checked) => set("hardwareEncoding", checked)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          Save settings
        </Button>
      </div>
    </form>
  )
}
