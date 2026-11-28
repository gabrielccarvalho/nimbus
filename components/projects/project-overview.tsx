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
  rerunProjectAction,
  retryProjectAction,
} from "@/features/projects/actions"
import { formatDuration } from "@/lib/format"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"
import { translateError } from "@/lib/i18n/errors"

import { overview } from "./messages/overview"
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
  const t = useMessages(overview).nextStep
  return (
    <section className="relative isolate flex flex-wrap items-center gap-6 overflow-hidden rounded-[18px] bg-graphite p-[22px] before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-[600px] before:w-[900px] before:-translate-1/2 before:bg-[radial-gradient(closest-side,rgb(255_179_107/0.07),transparent)]">
      <div className="grid min-w-0 flex-[1_1_300px] gap-2.5">
        <span className="flex items-center gap-2">
          <SignalDot tone="amber" lit />
          <span className="mono-label text-amber">{t.yourTurn}</span>
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
  const locale = useLocale()
  const t = overview[locale].nextStep
  const shared = common[locale]
  const id = snapshot.id
  const toReview = snapshot.clips.filter((c) => c.status === "candidate").length

  if (snapshot.status === "selecting" && snapshot.awaitingManualSelection) {
    return (
      <YourTurn
        title={t.pasteTitle}
        actions={
          <Button
            variant="primary"
            size="sm"
            nativeButton={false}
            render={<Link href={`/projects/${id}/clips`} />}
          >
            {t.openPrompt}
          </Button>
        }
      >
        {t.pasteBody}
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
          <b className="font-semibold">{t.failed}</b>
          <span className="text-[13px] break-words text-tertiary">
            {snapshot.error
              ? translateError(snapshot.error, locale)
              : t.unknownError}
          </span>
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await retryProjectAction(id)
              if (result.ok) toast.success(t.retrying)
              else toast.error(result.error.message)
            })
          }
        >
          <ArrowClockwiseIcon data-icon="inline-start" aria-hidden />
          {shared.retry}
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
              ? t.rendered
              : toReview > 0
                ? t.toReview(toReview)
                : t.reviewed}
          </b>
          <span className="text-[13px] text-tertiary">{t.approveHint}</span>
        </div>
        <Button
          variant="primary"
          size="sm"
          nativeButton={false}
          render={<Link href={`/projects/${id}/clips`} />}
        >
          {done ? t.openClips : t.reviewClips}
        </Button>
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
}: {
  initial: ProjectSnapshot
  facts: OverviewFacts
  clips?: readonly RenderClip[]
  videoSrc?: string | null
}) {
  const snapshot = useProjectEvents(initial)
  const locale = useLocale()
  const t = overview[locale].pipeline
  const shared = common[locale]
  const [pending, startTransition] = React.useTransition()
  const states = stepStates(snapshot.status, snapshot.failedStep)
  const pipelineJobs = snapshot.jobs.filter(
    (job) => job.type !== "publish_clip"
  )
  const activeJob = pipelineJobs.find((job) => job.status === "running")
  const queued = pipelineJobs.some((job) => job.status === "queued")
  const running = isRunning(snapshot.status)
  const now = useNow(running)
  const elapsedMs =
    activeJob?.startedAt && now !== null
      ? Math.max(0, now - Date.parse(activeJob.startedAt))
      : null
  const remainingMs =
    elapsedMs === null
      ? null
      : estimateRemainingMs(elapsedMs, activeJob?.progress ?? 0)
  const details = stepDetails(facts, locale)
  const times = stepTimes(snapshot.jobs)
  const totalMs = Object.values(times).reduce<number>((a, b) => a + (b ?? 0), 0)
  const waiting =
    snapshot.status === "selecting" && snapshot.awaitingManualSelection

  const run = (fn: () => Promise<void>) => startTransition(fn)

  return (
    <>
      <NextStep snapshot={snapshot} pending={pending} run={run} />
      <section className="grid gap-2 rounded-[18px] bg-graphite p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
            {t.title}
          </h2>
          <div className="flex items-center gap-3">
            {totalMs > 0 && (
              <span className="text-[13px] text-tertiary">
                {t.soFar(formatDuration(totalMs))}
              </span>
            )}
            {running && !waiting && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await cancelProjectAction(snapshot.id)
                    if (result.ok) toast.success(t.cancelled)
                    else toast.error(result.error.message)
                  })
                }
              >
                <XIcon data-icon="inline-start" aria-hidden />
                {shared.cancel}
              </Button>
            )}
          </div>
        </div>
        <PipelineStepper aria-label={t.progress}>
          {PIPELINE_STEPS.map((step, index) => {
            const skipped =
              step.id === "transcribe" &&
              states[index] === "complete" &&
              facts.transcription.skipped
            const state = skipped ? "skipped" : states[index]!
            const current = state === "current"
            const label =
              step.id === "upload" && facts.sourceUrl
                ? t.download
                : (t.steps[step.id] ?? step.label)
            const detail =
              current && activeJob
                ? `${t.jobs[activeJob.type] ?? activeJob.type} · ${activeJob.progress}%`
                : current && waiting
                  ? t.waitingForYou
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
                      {skipped && (
                        <>
                          {" · "}
                          {skipped !== "rejected" &&
                          facts.transcription.available ? (
                            <button
                              type="button"
                              className="text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                              disabled={pending || running}
                              onClick={() =>
                                run(async () => {
                                  const result = await rerunProjectAction(
                                    snapshot.id,
                                    "transcribe"
                                  )
                                  if (!result.ok)
                                    toast.error(
                                      translateError(
                                        result.error.message,
                                        locale
                                      )
                                    )
                                })
                              }
                            >
                              {t.transcribeNow}
                            </button>
                          ) : (
                            <Link
                              href="/settings/workspace"
                              className="text-foreground underline-offset-4 hover:underline"
                            >
                              {skipped === "rejected"
                                ? t.checkTranscriptionKey
                                : t.addTranscriptionKey}
                            </Link>
                          )}
                        </>
                      )}
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

        {running && !waiting && (
          <Progress
            value={activeJob?.progress ?? null}
            aria-live="polite"
            className="pt-2"
          >
            <ProgressLabel>
              {activeJob
                ? (t.jobs[activeJob.type] ?? activeJob.type)
                : queued
                  ? t.waitingForWorker
                  : t.starting}
            </ProgressLabel>
            <ProgressValue />
            {elapsedMs !== null && (
              <p
                className="w-full text-xs text-muted-foreground tabular-nums"
                data-testid="step-timing"
              >
                {t.elapsed(formatDuration(elapsedMs))}
                {remainingMs !== null &&
                  ` · ${t.remaining(formatDuration(remainingMs))}`}
              </p>
            )}
          </Progress>
        )}

        {running && (
          <StepDetailView
            snapshot={snapshot}
            clips={clips}
            videoSrc={videoSrc}
          />
        )}
      </section>
    </>
  )
}
