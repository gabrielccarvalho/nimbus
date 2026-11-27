"use client"

import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  CaptionFields,
  HighlightFields,
  NicheField,
  LanguageField,
  languageLabel,
  QualityField,
} from "@/components/settings/settings-fields"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  rerunProjectAction,
  updateProjectSettingsAction,
} from "@/features/projects/actions"
import type { ProjectSettingsData } from "@/features/projects/queries"
import type { RerunStep } from "@/features/projects/rerun"
import type { AudioTrack, ProjectSettings } from "@/features/projects/schema"
import { isRunning } from "@/features/pipeline/state-machine"
import { useLocale } from "@/lib/i18n/client"
import type { Locale } from "@/lib/i18n/config"

import { overview } from "./messages/overview"

type Messages = (typeof overview)[Locale]["settingsForm"]

function trackLabel(track: AudioTrack, t: Messages) {
  const parts = [track.title, track.language?.toUpperCase()].filter(Boolean)
  const channels =
    track.channels === 1
      ? t.mono
      : track.channels === 2
        ? t.stereo
        : t.channels(track.channels)
  return `${t.track(track.index + 1)}${parts.length ? ` · ${parts.join(" · ")}` : ""} (${channels})`
}

export function ProjectSettingsForm({
  data,
  onRerun,
}: {
  data: ProjectSettingsData
  onRerun?: () => void
}) {
  const {
    project,
    audioTracks,
    transcript,
    claudeAvailable,
    englishOnlyModel,
  } = data
  const router = useRouter()
  const locale = useLocale()
  const t = overview[locale].settingsForm
  const [pending, startTransition] = React.useTransition()
  const [settings, setSettings] = React.useState(project.settings)
  const [error, setError] = React.useState<string | null>(null)
  const [rerun, setRerun] = React.useState<RerunStep | null>(null)
  const running = isRunning(project.status)

  const set = <K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K]
  ) => setSettings((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateProjectSettingsAction(project.id, settings)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setError(null)
      setRerun(result.value.rerun)
      toast.success(t.saved)
      router.refresh()
    })
  }

  const runAgain = (step: RerunStep) => {
    startTransition(async () => {
      const result = await rerunProjectAction(project.id, step)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setRerun(null)
      onRerun?.()
      router.push(
        step === "render"
          ? `/projects/${project.id}/clips`
          : `/projects/${project.id}`
      )
    })
  }

  const detected = transcript
    ? t.transcribedAs(
        languageLabel(transcript.language, locale),
        transcript.source ? t.languageSources[transcript.source] : undefined
      )
    : project.sourceLanguage
      ? t.pageSays(languageLabel(project.sourceLanguage, locale))
      : undefined

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {rerun && (
        <Alert>
          <ArrowClockwiseIcon />
          <AlertTitle>{t.rerun[rerun].title}</AlertTitle>
          <AlertDescription>{t.rerun[rerun].description}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => runAgain(rerun)}
            >
              {t.rerun[rerun].action}
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.transcription}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <LanguageField
              value={settings}
              set={set}
              englishOnlyModel={englishOnlyModel}
              description={detected}
            />
            {audioTracks.length > 1 && (
              <Field>
                <FieldLabel htmlFor="audio-track">{t.voiceTrack}</FieldLabel>
                <Select
                  items={[
                    { value: "default", label: t.defaultTrack },
                    ...audioTracks.map((track) => ({
                      value: String(track.index),
                      label: trackLabel(track, t),
                    })),
                  ]}
                  value={
                    settings.audioTrack === null
                      ? "default"
                      : String(settings.audioTrack)
                  }
                  onValueChange={(value) =>
                    set(
                      "audioTrack",
                      !value || value === "default" ? null : Number(value)
                    )
                  }
                >
                  <SelectTrigger id="audio-track" className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t.defaultTrack}</SelectItem>
                    {audioTracks.map((track) => (
                      <SelectItem key={track.index} value={String(track.index)}>
                        {trackLabel(track, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t.tracksHint(audioTracks.length)}
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.highlights}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <NicheField value={settings} set={set} />
            <HighlightFields
              value={settings}
              set={set}
              claudeAvailable={claudeAvailable}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.captions}</CardTitle>
        </CardHeader>
        <CardContent>
          <CaptionFields value={settings} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.rendering}</CardTitle>
          <CardDescription>{t.renderingHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <QualityField value={settings} set={set} />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || running}>
          {t.save}
        </Button>
        {running && (
          <p className="text-sm text-muted-foreground">{t.running}</p>
        )}
      </div>
    </form>
  )
}
