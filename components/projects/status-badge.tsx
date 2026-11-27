import { StatusPill } from "@/components/ui/status-pill"
import type { Tone } from "@/components/ui/tone"
import type { ClipStatus } from "@/features/clips/schema"
import type { ProjectStatus } from "@/features/projects/schema"
import { useLocale } from "@/lib/i18n/client"
import { defaultLocale, type Locale } from "@/lib/i18n/config"

import { overview } from "./messages/overview"

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

export function projectSignal(
  {
    status,
    failedStep,
    awaitingManualSelection,
    reviewCount = 0,
  }: ProjectSignalInput,
  locale: Locale = defaultLocale
): ProjectSignal {
  const t = overview[locale].status
  if (status === "selecting" && awaitingManualSelection)
    return {
      tone: "amber",
      label: t.needsYou,
      detail: t.pasteHighlights,
      needsYou: true,
    }
  if (status === "ready_for_review")
    return {
      tone: "mint",
      label: reviewCount > 0 ? t.toReview(reviewCount) : t.ready,
      detail: reviewCount > 0 ? null : t.approveToRender,
      needsYou: false,
    }
  if (status === "failed")
    return {
      tone: "pink",
      label: failedStep ? t.stepFailed[failedStep] : t.project.failed,
      detail: null,
      needsYou: false,
    }
  return {
    tone: PROJECT_TONES[status],
    label: t.project[status],
    detail: null,
    needsYou: false,
  }
}

export type ProjectFilter = "needs" | "processing" | "ready" | "done" | "other"

export function projectFilter(input: ProjectSignalInput): ProjectFilter {
  if (projectSignal(input).needsYou) return "needs"
  if (input.status === "ready_for_review") return "ready"
  if (input.status === "done") return "done"
  if (input.status === "failed" || input.status === "cancelled") return "other"
  return "processing"
}

export function projectStatusLabel(
  status: ProjectStatus,
  locale: Locale = defaultLocale
) {
  return overview[locale].status.project[status]
}

export function projectStatusTone(status: ProjectStatus) {
  return PROJECT_TONES[status]
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const locale = useLocale()
  return (
    <StatusPill tone={PROJECT_TONES[status]}>
      {projectStatusLabel(status, locale)}
    </StatusPill>
  )
}

const CLIP_TONES: Record<ClipStatus, Tone> = {
  candidate: "amber",
  approved: "mint",
  rejected: "neutral",
  rendering: "lav",
  rendered: "mint",
  failed: "pink",
}

export function clipStatusLabel(
  status: ClipStatus,
  locale: Locale = defaultLocale
) {
  return overview[locale].status.clip[status]
}

export function ClipStatusBadge({
  status,
  className,
}: {
  status: ClipStatus
  className?: string
}) {
  const locale = useLocale()
  return (
    <StatusPill tone={CLIP_TONES[status]} className={className}>
      {clipStatusLabel(status, locale)}
    </StatusPill>
  )
}
