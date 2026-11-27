import { StatusPill } from "@/components/ui/status-pill"
import type { Tone } from "@/components/ui/tone"
import type { ClipStatus } from "@/features/clips/schema"
import type { ProjectStatus } from "@/features/projects/schema"

const LABELS: Record<ProjectStatus, string> = {
  downloading: "Downloading",
  uploaded: "Uploaded",
  probing: "Probing",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  selecting: "Finding highlights",
  ready_for_review: "Ready for review",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

const PROJECT_TONES: Record<ProjectStatus, Tone> = {
  downloading: "lav",
  uploaded: "lav",
  probing: "lav",
  transcribing: "lav",
  analyzing: "lav",
  selecting: "lav",
  ready_for_review: "mint",
  rendering: "lav",
  done: "sky",
  failed: "pink",
  cancelled: "neutral",
}

export type ProjectSignalInput = {
  status: ProjectStatus
  failedStep?: ProjectStatus | null
  awaitingManualSelection?: boolean
  reviewCount?: number
}

export type ProjectSignal = {
  tone: Tone
  label: string
  detail: string | null
  needsYou: boolean
}

export function projectSignal({
  status,
  failedStep,
  awaitingManualSelection,
  reviewCount = 0,
}: ProjectSignalInput): ProjectSignal {
  if (status === "selecting" && awaitingManualSelection)
    return {
      tone: "amber",
      label: "Needs you",
      detail: "Paste highlights",
      needsYou: true,
    }
  if (status === "ready_for_review")
    return {
      tone: "mint",
      label: reviewCount > 0 ? `${reviewCount} to review` : "Ready",
      detail: reviewCount > 0 ? null : "Approve clips to render",
      needsYou: false,
    }
  if (status === "failed")
    return {
      tone: "pink",
      label: failedStep ? `${LABELS[failedStep]} failed` : "Failed",
      detail: null,
      needsYou: false,
    }
  return {
    tone: PROJECT_TONES[status],
    label: LABELS[status],
    detail: null,
    needsYou: false,
  }
}

export type ProjectFilter =
  "needs" | "processing" | "ready" | "done" | "failed" | "other"

export function projectFilter(input: ProjectSignalInput): ProjectFilter {
  if (projectSignal(input).needsYou) return "needs"
  if (input.status === "ready_for_review") return "ready"
  if (input.status === "done") return "done"
  if (input.status === "failed") return "failed"
  if (input.status === "cancelled") return "other"
  return "processing"
}

/** What the person does next, shown on the project tile. */
export function projectNextStep(
  input: ProjectSignalInput & { clipCount?: number }
): string | null {
  const signal = projectSignal(input)
  if (signal.needsYou) return "Next: paste highlights"
  if (input.status === "failed") return "Open it to retry the step"
  if (input.status === "cancelled") return "Open it to run it again"
  if (input.status === "ready_for_review")
    return (input.reviewCount ?? 0) > 0
      ? "Next: review clips"
      : "Next: approve clips to render"
  if (input.status === "done") return "Rendered. Open it to download or publish"
  return null
}

export function projectStatusLabel(status: ProjectStatus) {
  return LABELS[status]
}

export function projectStatusTone(status: ProjectStatus) {
  return PROJECT_TONES[status]
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusPill tone={PROJECT_TONES[status]}>{LABELS[status]}</StatusPill>
}

const CLIP_LABELS: Record<ClipStatus, string> = {
  candidate: "To review",
  approved: "Approved",
  rejected: "Rejected",
  rendering: "Rendering",
  rendered: "Rendered",
  failed: "Render failed",
}

const CLIP_TONES: Record<ClipStatus, Tone> = {
  candidate: "amber",
  approved: "mint",
  rejected: "neutral",
  rendering: "lav",
  rendered: "mint",
  failed: "pink",
}

export function clipStatusLabel(status: ClipStatus) {
  return CLIP_LABELS[status]
}

export function ClipStatusBadge({
  status,
  className,
}: {
  status: ClipStatus
  className?: string
}) {
  return (
    <StatusPill tone={CLIP_TONES[status]} className={className}>
      {CLIP_LABELS[status]}
    </StatusPill>
  )
}
