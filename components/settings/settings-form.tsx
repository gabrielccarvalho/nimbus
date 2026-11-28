"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { saveSettingsAction } from "@/features/settings/actions"
import type { AppSettings } from "@/features/settings/schema"
import { useMessages } from "@/lib/i18n/client"

import { CaptionStyleFields } from "@/components/projects/caption-style-fields"
import {
  CamPositionField,
  LayoutModeOptions,
} from "@/components/projects/layout-fields"
import { CaptionStylePreview } from "@/components/projects/caption-style-preview"
import {
  placeCaption,
  resolveCaptionStyle,
  type CaptionFontId,
} from "@/features/captions/styles"

import {
  HighlightFields,
  LanguageField,
  NicheField,
  PublishingFields,
  QualityField,
} from "./settings-fields"
import { settings as messages } from "./messages"
import { SettingsSection, SettingsSectionHeader } from "./section"

export function SettingsForm({
  section,
  settings: initial,
  claudeAvailable,
  workerOnline,
  hardwareEncoder,
  transcriptionOff,
  installedFonts,
}: {
  section: "defaults" | "layout" | "captions" | "rendering"
  settings: AppSettings
  claudeAvailable: boolean
  workerOnline: boolean
  hardwareEncoder: string | null
  transcriptionOff: boolean
  installedFonts: readonly CaptionFontId[]
}) {
  const router = useRouter()
  const { nav, form, fields } = useMessages(messages)
  const t = form.sections[section]
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
      toast.success(t.saved)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-[18px]">
      <SettingsSection aria-labelledby={`${section}-title`}>
        <SettingsSectionHeader
          id={`${section}-title`}
          title={nav[section]}
          description={t.description}
        />
        {section === "defaults" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <LanguageField
                value={settings}
                set={set}
                transcriptionOff={transcriptionOff}
              />
              <NicheField value={settings} set={set} />
            </div>
            <HighlightFields
              value={settings}
              set={set}
              claudeAvailable={claudeAvailable}
            />
            <PublishingFields value={settings} set={set} />
          </>
        )}
        {section === "layout" && (
          <>
            <LayoutModeOptions
              value={settings.layoutMode}
              onValueChange={(mode) => set("layoutMode", mode)}
            />
            <CamPositionField
              value={settings.camPosition}
              onValueChange={(camPosition) => set("camPosition", camPosition)}
            />
          </>
        )}
        {section === "captions" && (
          <div className="flex flex-wrap items-start gap-[22px]">
            <div className="grid min-w-0 flex-[999_1_360px] gap-5">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="captions-enabled">
                    {fields.burnIn}
                  </FieldLabel>
                  <FieldDescription>{fields.burnInHint}</FieldDescription>
                </FieldContent>
                <Switch
                  id="captions-enabled"
                  checked={settings.captionsEnabled}
                  onCheckedChange={(checked) => set("captionsEnabled", checked)}
                />
              </Field>
              <CaptionStyleFields
                value={settings.captionStyle}
                onValueChange={(captionStyle) =>
                  set("captionStyle", captionStyle)
                }
                installedFonts={installedFonts}
                disabled={!settings.captionsEnabled}
              />
            </div>
            <CaptionStylePreview
              style={resolveCaptionStyle(settings.captionStyle)}
              onBaselineChange={
                settings.captionsEnabled
                  ? (baseline) =>
                      set(
                        "captionStyle",
                        placeCaption(settings.captionStyle, baseline)
                      )
                  : undefined
              }
              className="max-w-[220px] flex-[1_1_180px] rounded-2xl md:sticky md:top-[84px]"
            />
          </div>
        )}
        {section === "rendering" && (
          <>
            {!workerOnline && (
              <Alert>
                <AlertTitle>{form.noWorker}</AlertTitle>
                <AlertDescription>{form.noWorkerHint}</AlertDescription>
              </Alert>
            )}
            <QualityField value={settings} set={set} />
            <Field orientation="horizontal" data-disabled={!hardwareEncoder}>
              <FieldContent>
                <FieldLabel htmlFor="hardware-encoding">
                  {form.hardware}
                </FieldLabel>
                <FieldDescription>
                  {hardwareEncoder
                    ? form.hardwareWith(hardwareEncoder)
                    : workerOnline
                      ? form.hardwareMissing
                      : form.hardwareOffline}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="hardware-encoding"
                checked={settings.hardwareEncoding && Boolean(hardwareEncoder)}
                disabled={!hardwareEncoder}
                onCheckedChange={(checked) => set("hardwareEncoding", checked)}
              />
            </Field>
          </>
        )}
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {t.save}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-pink">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
