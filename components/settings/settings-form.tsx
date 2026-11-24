"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

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

import {
  CaptionFields,
  HighlightFields,
  LanguageField,
  NicheField,
  QualityField,
} from "./settings-fields"
import { SettingsSection, SettingsSectionHeader } from "./section"

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
      toast.success("Defaults saved")
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-[18px]">
      <SettingsSection id="defaults" aria-labelledby="defaults-title">
        <SettingsSectionHeader
          id="defaults-title"
          title="Project defaults"
          description="Where every new import starts. Imports can override them, and each project keeps its own copy."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <LanguageField
            value={settings}
            set={set}
            englishOnlyModel={englishOnlyModel}
          />
          <NicheField value={settings} set={set} />
        </div>
        <HighlightFields
          value={settings}
          set={set}
          claudeAvailable={claudeAvailable}
        />
      </SettingsSection>

      <SettingsSection id="rendering" aria-labelledby="rendering-title">
        <SettingsSectionHeader
          id="rendering-title"
          title="Captions & rendering"
          description="Quality is the default for new projects. Hardware encoding applies to every render on this machine."
        />
        <CaptionFields value={settings} set={set} />
        <QualityField value={settings} set={set} />
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
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          Save defaults
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
