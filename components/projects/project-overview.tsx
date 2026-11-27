"use client"

import {
  ArrowClockwiseIcon,
  CheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { HeaderSlot } from "@/components/app-shell/header-slot"
import { Button } from "@/components/ui/button"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { SignalDot } from "@/components/ui/signal-dot"
import { estimateRemainingMs } from "@/features/pipeline/detail"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import {
  isRunning,
  PIPELINE_STEPS,
  stepStates,
} from "@/features/pipeline/state-machine"
import {
  cancelProjectAction,
  retryProjectAction,
} from "@/features/projects/actions"
import { formatDuration } from "@/lib/format"

import { stepDetails, stepTimes, type OverviewFacts } from "./overview-steps"
import {
  PipelineStep,
  PipelineStepContent,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepper,
  PipelineStepTime,
} from "./pipeline-stepper"
import { StepDetailView, useNow, type RenderClip } from "./step-detail"
import { useProjectEvents } from "./use-project-events"

const JOB_LABELS: Record<string, string> = {
  download: "Downloading",
  probe: "Reading the video",
  transcribe: "Transcribing",
  analyze: "Analyzing audio",
  select: "Finding highlights",
  render_clip: "Rendering clip",
  render_edit: "Rendering edit",
}

function ActionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex flex-wrap items-center gap-4 rounded-[18px] bg-graphite p-[22px] ${className ?? ""}`}
    >
      {children}
    </section>
  )
}

function YourTurn({
  title,
  children,
  actions,
}: {
  title: string
  children: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <section className="relative isolate flex flex-wrap items-center gap-6 overflow-hidden rounded-[18px] bg-graphite p-[22px] before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-[600px] before:w-[900px] before:-translate-1/2 before:bg-[radial-gradient(closest-side,rgb(255_179_107/0.07),transparent)]">
      <div className="grid min-w-0 flex-[1_1_300px] gap-2.5">
        <span className="flex items-center gap-2">
          <SignalDot tone="amber" lit />
          <span className="mono-label text-amber">Your turn</span>
        </span>
        <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.03em] text-balance">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{children}</p>
        <div className="mt-1 flex flex-wrap gap-2">{actions}</div>
      </div>
    </section>
  )
}

function NextStep({
  snapshot,
  pending,
  run,
}: {
  snapshot: ProjectSnapshot
  pending: boolean
  run: (fn: () => Promise<void>) => void
}) {
  const id = snapshot.id
  const toReview = snapshot.clips.filter((c) => c.status === "candidate").length

  if (snapshot.status === "selecting" && snapshot.awaitingManualSelection) {
    return (
      <YourTurn
        title="Paste Claude's highlights to continue."
        actions={
          <HeaderSlot>
            <Button
              variant="primary"
              nativeButton={false}
              render={<Link href={`/projects/${id}/clips`} />}
            >
              Open the prompt
            </Button>
          </HeaderSlot>
        }
      >
        Copy the prompt into Claude, then paste its answer back. Nimbus takes it
        from there.
      </YourTurn>
    )
  }

  if (snapshot.status === "failed") {
    return (
      <ActionCard>
        <span className="grid size-9 place-items-center rounded-full bg-pink/14 text-pink inset-ring-1 inset-ring-pink/45">
          <WarningCircleIcon className="size-4" aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="font-semibold">This step failed</b>
          <span className="text-[13px] break-words text-tertiary">
            {snapshot.error ?? "Unknown error"}
          </span>
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await retryProjectAction(id)
              if (result.ok) toast.success("Retrying")
              else toast.error(result.error.message)
            })
          }
        >
          <ArrowClockwiseIcon data-icon="inline-start" aria-hidden />
          Retry
        </Button>
      </ActionCard>
    )
  }

  if (snapshot.status === "ready_for_review" || snapshot.status === "done") {
    const done = snapshot.status === "done"
    return (
      <ActionCard>
        <span className="grid size-9 place-items-center rounded-full bg-mint/14 text-mint inset-ring-1 inset-ring-mint/45">
          <CheckIcon className="size-4" weight="bold" aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="font-semibold">
            {done
              ? "Rendered. Download the clips you approved."
              : toReview > 0
                ? `${toReview} ${toReview === 1 ? "clip is" : "clips are"} ready to review.`
                : "Every clip is reviewed."}
          </b>
          <span className="text-[13px] text-tertiary">
            Approve the ones you like; only approved clips render.
          </span>
        </div>
        <HeaderSlot>
          <Button
            variant="primary"
            nativeButton={false}
            render={<Link href={`/projects/${id}/clips`} />}
          >
            {done ? "Open clips" : "Review clips"}
          </Button>
        </HeaderSlot>
      </ActionCard>
    )
  }

  return null
}

export function ProjectOverview({
  initial,
  facts,
  clips = [],
  videoSrc = null,
  children,
}: {
  /** The rest of the stage: the source preview and the top picks. */
  children?: React.ReactNode
  initial: ProjectSnapshot
  facts: OverviewFacts
  clips?: readonly RenderClip[]
  videoSrc?: string | null
}) {
  const snapshot = useProjectEvents(initial)
  const [pending, startTransition] = React.useTransition()
  const states = stepStates(snapshot.status, snapshot.failedStep)
  const pipelineJobs = snapshot.jobs.filter(
    (job) => job.type !== "publish_clip"
  )
  const activeJob = pipelineJobs.find((job) => job.status === "running")
  const queued = pipelineJobs.some((job) => job.status === "queued")
  const running = isRunning(snapshot.status)
  const now = useNow(running)
  const elapsedMs = activeJob?.startedAt
    ? Math.max(0, now - Date.parse(activeJob.startedAt))
    : null
  const remainingMs =
    elapsedMs === null
      ? null
      : estimateRemainingMs(elapsedMs, activeJob?.progress ?? 0)
  const details = stepDetails(facts)
  const times = stepTimes(snapshot.jobs)
  const totalMs = Object.values(times).reduce<number>((a, b) => a + (b ?? 0), 0)
  const waiting =
    snapshot.status === "selecting" && snapshot.awaitingManualSelection

  const run = (fn: () => Promise<void>) => startTransition(fn)

  const live = running && !waiting

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        aria-label="Project"
        className="grid min-w-0 flex-1 content-start gap-[18px] p-[18px] lg:overflow-y-auto"
      >
        <NextStep snapshot={snapshot} pending={pending} run={run} />
        {running && (
          <section
            aria-label="Current step"
            className="grid gap-3 rounded-[18px] bg-graphite p-5"
          >
            {live && (
              <Progress value={activeJob?.progress ?? null} aria-live="polite">
                <ProgressLabel>
                  {activeJob
                    ? (JOB_LABELS[activeJob.type] ?? activeJob.type)
                    : queued
                      ? "Waiting for the worker…"
                      : "Starting…"}
                </ProgressLabel>
                <ProgressValue />
                {elapsedMs !== null && (
                  <p
                    className="w-full text-xs text-muted-foreground tabular-nums"
                    data-testid="step-timing"
                  >
                    {formatDuration(elapsedMs)} elapsed
                    {remainingMs !== null &&
                      ` · about ${formatDuration(remainingMs)} left`}
                  </p>
                )}
              </Progress>
            )}
            <StepDetailView
              snapshot={snapshot}
              clips={clips}
              videoSrc={videoSrc}
            />
          </section>
        )}
        {children}
      </section>
      <aside
        aria-label="Pipeline"
        className="flex w-full shrink-0 flex-col lg:w-[340px] lg:shadow-[inset_1px_0_0_var(--hair)]"
      >
        <div className="flex min-h-[52px] items-center gap-3 px-4 pt-3">
          <h2 className="mono-label">Pipeline</h2>
          <span className="flex-1" />
          {live && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await cancelProjectAction(snapshot.id)
                  if (result.ok) toast.success("Cancelled")
                  else toast.error(result.error.message)
                })
              }
            >
              <XIcon data-icon="inline-start" aria-hidden />
              Cancel
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 px-4 pb-3 lg:overflow-y-auto">
          <PipelineStepper aria-label="Pipeline progress">
            {PIPELINE_STEPS.map((step, index) => {
              const state = states[index]!
              const current = state === "current"
              const label =
                step.id === "upload" && facts.sourceUrl
                  ? "Download"
                  : step.label
              // The percent lives on the progress bar; a step says it once.
              const detail =
                current && activeJob
                  ? (JOB_LABELS[activeJob.type] ?? activeJob.type)
                  : current && waiting
                    ? "Waiting for you"
                    : state === "upcoming" &&
                        step.id !== "review" &&
                        step.id !== "render"
                      ? null
                      : details[step.id]
              return (
                <PipelineStep
                  key={step.id}
                  state={state}
                  attention={current && waiting}
                >
                  <PipelineStepContent>
                    <PipelineStepLabel>{label}</PipelineStepLabel>
                    {detail && (
                      <PipelineStepDescription>
                        {detail}
                      </PipelineStepDescription>
                    )}
                  </PipelineStepContent>
                  <PipelineStepTime>
                    {times[step.id] !== undefined
                      ? formatDuration(times[step.id]!)
                      : "—"}
                  </PipelineStepTime>
                </PipelineStep>
              )
            })}
          </PipelineStepper>
        </div>
        <p className="flex justify-between gap-3 px-4 py-3 text-[12.5px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]">
          <span>Pipeline time so far</span>
          <span className="font-mono tabular-nums">
            {totalMs > 0 ? formatDuration(totalMs) : "—"}
          </span>
        </p>
      </aside>
    </div>
  )
}
