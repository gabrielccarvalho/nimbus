import { AppError } from "@/lib/errors"

import { projectStatuses, type ProjectStatus } from "../projects/schema"
import type { JobType } from "../jobs/schema"

export const RUNNING_STATUSES = [
  "downloading",
  "probing",
  "transcribing",
  "analyzing",
  "selecting",
  "rendering",
] as const satisfies readonly ProjectStatus[]

export type RunningStatus = (typeof RUNNING_STATUSES)[number]

const forward: Record<ProjectStatus, readonly ProjectStatus[]> = {
  downloading: ["uploaded"],
  uploaded: ["probing"],
  probing: ["transcribing"],
  transcribing: ["analyzing"],
  analyzing: ["selecting"],
  selecting: ["awaiting_layout", "ready_for_review"],
  awaiting_layout: ["ready_for_review"],
  ready_for_review: ["rendering", "awaiting_layout"],
  rendering: ["done", "ready_for_review"],
  done: ["rendering", "ready_for_review"],
  failed: [],
  cancelled: [],
}

export function isRunning(status: ProjectStatus): status is RunningStatus {
  return (RUNNING_STATUSES as readonly ProjectStatus[]).includes(status)
}

export function allowedTransitions(from: ProjectStatus): ProjectStatus[] {
  const targets = [...forward[from]]
  if (isRunning(from)) targets.push("failed", "cancelled")
  return targets
}

export function canTransition(from: ProjectStatus, to: ProjectStatus) {
  return allowedTransitions(from).includes(to)
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus) {
  if (!canTransition(from, to)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Can't move a project from ${from} to ${to}`,
      { details: { from, to } }
    )
  }
}

export function retryTarget(
  status: ProjectStatus,
  failedStep: ProjectStatus | null
): RunningStatus {
  if (status !== "failed") {
    throw new AppError(
      "INVALID_TRANSITION",
      `Only failed projects can be retried (status is ${status})`
    )
  }
  if (!failedStep || !isRunning(failedStep)) {
    throw new AppError("INVALID_TRANSITION", "The failed step is unknown")
  }
  return failedStep
}

const statusForJob: Record<JobType, RunningStatus | null> = {
  download: "downloading",
  probe: "probing",
  transcribe: "transcribing",
  analyze: "analyzing",
  select: "selecting",
  render_clip: "rendering",
  render_edit: "rendering",
  sweep: null,
}

export function statusForJobType(type: JobType): RunningStatus | null {
  return statusForJob[type]
}

const jobForStatus: Record<RunningStatus, JobType | null> = {
  downloading: "download",
  probing: "probe",
  transcribing: "transcribe",
  analyzing: "analyze",
  selecting: "select",
  rendering: null,
}

export function jobTypeForStep(status: RunningStatus): JobType | null {
  return jobForStatus[status]
}

export type PipelineStep = {
  id: string
  label: string
  statuses: readonly ProjectStatus[]
}

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { id: "upload", label: "Upload", statuses: ["downloading", "uploaded"] },
  { id: "probe", label: "Probe", statuses: ["probing"] },
  { id: "transcribe", label: "Transcribe", statuses: ["transcribing"] },
  { id: "analyze", label: "Analyze", statuses: ["analyzing"] },
  { id: "select", label: "Find highlights", statuses: ["selecting"] },
  { id: "layout", label: "Confirm layout", statuses: ["awaiting_layout"] },
  { id: "review", label: "Review", statuses: ["ready_for_review"] },
  { id: "render", label: "Render", statuses: ["rendering", "done"] },
]

export type StepState = "complete" | "current" | "upcoming" | "failed"

export function stepStates(
  status: ProjectStatus,
  failedStep: ProjectStatus | null = null
): StepState[] {
  const effective =
    status === "failed" || status === "cancelled" ? failedStep : status
  const currentIndex = effective
    ? PIPELINE_STEPS.findIndex((step) => step.statuses.includes(effective))
    : -1
  return PIPELINE_STEPS.map((_, index) => {
    if (status === "done") return "complete"
    if (index < currentIndex) return "complete"
    if (index === currentIndex)
      return status === "failed" ? "failed" : "current"
    return "upcoming"
  })
}

export { projectStatuses }
