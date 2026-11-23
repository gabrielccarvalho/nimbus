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
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { saveSettingsAction } from "@/features/settings/actions"
import type { AppSettings } from "@/features/settings/schema"

import {
  CaptionFields,
  HighlightFields,
  LanguageField,
  QualityField,
} from "./settings-fields"

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
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
          <CardDescription>
            Default for new projects. Imports can override it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageField
            value={settings}
            set={set}
            englishOnlyModel={englishOnlyModel}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Highlights</CardTitle>
          <CardDescription>Defaults for new projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <HighlightFields
            value={settings}
            set={set}
            claudeAvailable={claudeAvailable}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captions</CardTitle>
          <CardDescription>Defaults for new projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <CaptionFields value={settings} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendering</CardTitle>
          <CardDescription>
            Quality is the default for new projects. Hardware encoding applies
            to every render on this machine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
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
          Save defaults
        </Button>
      </div>
    </form>
  )
}
