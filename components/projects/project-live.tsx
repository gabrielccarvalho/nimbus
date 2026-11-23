"use client"

import {
  ArrowClockwiseIcon,
  XIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import * as React from "react"
import { toast } from "sonner"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import {
  cancelProjectAction,
  retryProjectAction,
} from "@/features/projects/actions"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import {
  isRunning,
  PIPELINE_STEPS,
  stepStates,
} from "@/features/pipeline/state-machine"

import {
  PipelineStep,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepper,
} from "./pipeline-stepper"
import { ProjectStatusBadge } from "./status-badge"
import { useProjectEvents } from "./use-project-events"

const JOB_LABELS: Record<string, string> = {
  probe: "Reading video",
  transcribe: "Transcribing",
  analyze: "Analyzing audio",
  select: "Finding highlights",
  render_clip: "Rendering clip",
  render_edit: "Rendering edit",
}

export function ProjectLive({ initial }: { initial: ProjectSnapshot }) {
  const snapshot = useProjectEvents(initial)
  const [pending, startTransition] = React.useTransition()
  const states = stepStates(snapshot.status, snapshot.failedStep)
  const activeJob = snapshot.jobs.find((job) => job.status === "running")
  const queued = snapshot.jobs.some((job) => job.status === "queued")
  const running = isRunning(snapshot.status)

  const act = (action: typeof retryProjectAction, success: string) =>
    startTransition(async () => {
      const result = await action(snapshot.id)
      if (result.ok) toast.success(success)
      else toast.error(result.error.message)
    })

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          Pipeline <ProjectStatusBadge status={snapshot.status} />
        </CardTitle>
        {running && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => act(cancelProjectAction, "Cancelled")}
          >
            <XIcon data-icon="inline-start" aria-hidden />
            Cancel
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PipelineStepper aria-label="Pipeline progress">
          {PIPELINE_STEPS.map((step, index) => (
            <PipelineStep key={step.id} state={states[index]}>
              <PipelineStepLabel>{step.label}</PipelineStepLabel>
              {states[index] === "current" && activeJob && (
                <PipelineStepDescription>
                  {activeJob.progress}%
                </PipelineStepDescription>
              )}
            </PipelineStep>
          ))}
        </PipelineStepper>

        {running && (
          <Progress value={activeJob?.progress ?? null} aria-live="polite">
            <ProgressLabel>
              {activeJob
                ? (JOB_LABELS[activeJob.type] ?? activeJob.type)
                : queued
                  ? "Waiting for the worker…"
                  : "Starting…"}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
        )}

        {snapshot.status === "failed" && (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden />
            <AlertTitle>This step failed</AlertTitle>
            <AlertDescription className="break-words">
              {snapshot.error ?? "Unknown error"}
            </AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(retryProjectAction, "Retrying")}
              >
                <ArrowClockwiseIcon data-icon="inline-start" aria-hidden />
                Retry
              </Button>
            </AlertAction>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
