import {
  CheckCircleIcon,
  CircleNotchIcon,
  HandPointingIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr"

import { Badge } from "@/components/ui/badge"
import type { ClipStatus } from "@/features/clips/schema"
import type { ProjectStatus } from "@/features/projects/schema"
import { cn } from "@/lib/utils"

const LABELS: Record<ProjectStatus, string> = {
  downloading: "Downloading",
  uploaded: "Uploaded",
  probing: "Probing",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  selecting: "Finding highlights",
  awaiting_layout: "Confirm layout",
  ready_for_review: "Ready for review",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

export function projectStatusLabel(status: ProjectStatus) {
  return LABELS[status]
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  switch (status) {
    case "downloading":
    case "probing":
    case "transcribing":
    case "analyzing":
    case "selecting":
    case "rendering":
      return (
        <Badge variant="secondary">
          <CircleNotchIcon
            data-icon="inline-start"
            className="motion-safe:animate-spin"
            aria-hidden
          />
          {LABELS[status]}
        </Badge>
      )
    case "awaiting_layout":
    case "ready_for_review":
      return (
        <Badge variant="secondary">
          <HandPointingIcon data-icon="inline-start" aria-hidden />
          {LABELS[status]}
        </Badge>
      )
    case "done":
      return (
        <Badge>
          <CheckCircleIcon data-icon="inline-start" aria-hidden />
          {LABELS[status]}
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive">
          <WarningCircleIcon data-icon="inline-start" aria-hidden />
          {LABELS[status]}
        </Badge>
      )
    case "cancelled":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <ProhibitIcon data-icon="inline-start" aria-hidden />
          {LABELS[status]}
        </Badge>
      )
    case "uploaded":
      return <Badge variant="outline">{LABELS[status]}</Badge>
  }
}

const CLIP_LABELS: Record<ClipStatus, string> = {
  candidate: "Candidate",
  approved: "Approved",
  rejected: "Rejected",
  rendering: "Rendering",
  rendered: "Rendered",
  failed: "Render failed",
}

export function ClipStatusBadge({
  status,
  className,
}: {
  status: ClipStatus
  className?: string
}) {
  switch (status) {
    case "rendering":
      return (
        <Badge variant="secondary" className={className}>
          <CircleNotchIcon
            data-icon="inline-start"
            className="motion-safe:animate-spin"
            aria-hidden
          />
          {CLIP_LABELS[status]}
        </Badge>
      )
    case "approved":
    case "rendered":
      return <Badge className={className}>{CLIP_LABELS[status]}</Badge>
    case "failed":
      return (
        <Badge variant="destructive" className={className}>
          <WarningCircleIcon data-icon="inline-start" aria-hidden />
          {CLIP_LABELS[status]}
        </Badge>
      )
    case "rejected":
      return (
        <Badge
          variant="outline"
          className={cn("text-muted-foreground", className)}
        >
          {CLIP_LABELS[status]}
        </Badge>
      )
    case "candidate":
      return (
        <Badge variant="outline" className={className}>
          {CLIP_LABELS[status]}
        </Badge>
      )
  }
}
