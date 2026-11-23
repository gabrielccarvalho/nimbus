"use client"

import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  CaptionFields,
  HighlightFields,
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

const RERUN: Record<
  RerunStep,
  { title: string; description: string; action: string }
> = {
  transcribe: {
    title: "Transcribe again?",
    description:
      "The language or voice track changed. Transcribing again also finds new highlights; approved and rendered clips are kept.",
    action: "Transcribe again",
  },
  select: {
    title: "Find highlights again?",
    description:
      "Highlight options changed. Candidates are replaced; approved and rendered clips are kept.",
    action: "Find highlights again",
  },
  render: {
    title: "Render clips again?",
    description:
      "Caption or quality options changed for clips already rendered.",
    action: "Render again",
  },
}

const LANGUAGE_SOURCE: Record<string, string> = {
  setting: "chosen in settings",
  source: "from the video's page",
  detected: "detected",
  whisper: "detected by Whisper",
}

function trackLabel(track: AudioTrack) {
  const parts = [track.title, track.language?.toUpperCase()].filter(Boolean)
  const channels =
    track.channels === 1
      ? "mono"
      : track.channels === 2
        ? "stereo"
        : `${track.channels} ch`
  return `Track ${track.index + 1}${parts.length ? ` · ${parts.join(" · ")}` : ""} (${channels})`
}

export function ProjectSettingsForm({ data }: { data: ProjectSettingsData }) {
  const {
    project,
    audioTracks,
    transcript,
    claudeAvailable,
    englishOnlyModel,
  } = data
  const router = useRouter()
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
      toast.success("Project settings saved")
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
      router.push(
        step === "render"
          ? `/projects/${project.id}/clips`
          : `/projects/${project.id}`
      )
    })
  }

  const detected = transcript
    ? `Transcribed as ${languageLabel(transcript.language)}${transcript.source ? ` (${LANGUAGE_SOURCE[transcript.source]})` : ""}.`
    : project.sourceLanguage
      ? `The video's page says ${languageLabel(project.sourceLanguage)}; that's used when set to detect.`
      : undefined

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {rerun && (
        <Alert>
          <ArrowClockwiseIcon />
          <AlertTitle>{RERUN[rerun].title}</AlertTitle>
          <AlertDescription>{RERUN[rerun].description}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => runAgain(rerun)}
            >
              {RERUN[rerun].action}
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
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
                <FieldLabel htmlFor="audio-track">Voice track</FieldLabel>
                <Select
                  items={[
                    { value: "default", label: "Default track" },
                    ...audioTracks.map((track) => ({
                      value: String(track.index),
                      label: trackLabel(track),
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
                    <SelectItem value="default">Default track</SelectItem>
                    {audioTracks.map((track) => (
                      <SelectItem key={track.index} value={String(track.index)}>
                        {trackLabel(track)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  This recording has {audioTracks.length} audio tracks. Pick the
                  one with only your microphone so game dialogue isn&apos;t
                  transcribed. Loudness still uses the full mix.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Highlights</CardTitle>
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
        </CardHeader>
        <CardContent>
          <CaptionFields value={settings} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendering</CardTitle>
          <CardDescription>
            Hardware encoding is set for all projects in Settings.
          </CardDescription>
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
          Save project settings
        </Button>
        {running && (
          <p className="text-sm text-muted-foreground">
            Settings can be changed once the current step finishes.
          </p>
        )}
      </div>
    </form>
  )
}
