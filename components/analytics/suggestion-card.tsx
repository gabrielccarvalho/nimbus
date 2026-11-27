"use client"

import { CheckIcon, XIcon } from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { DotMeter } from "@/components/ui/dot-meter"
import { StatusPill } from "@/components/ui/status-pill"
import {
  approveSuggestionAction,
  rejectSuggestionAction,
} from "@/features/insights/actions"
import type {
  EvidenceClip,
  RuleView,
  SuggestionView,
} from "@/features/insights/queries"
import type { SuggestionKind } from "@/features/insights/schema"

import {
  RetirePickDialog,
  RuleTextField,
  Subject,
  TARGET_LABELS,
} from "./playbook"
import { useInsightAction } from "./use-insight-action"

const KIND_LABELS: Record<SuggestionKind, string> = {
  add: "New rule",
  edit: "Change rule",
  retire: "Retire rule",
}

const views = new Intl.NumberFormat("en")

function confidenceLabel(confidence: number) {
  if (confidence >= 0.7) return "Strong"
  if (confidence >= 0.4) return "Moderate"
  return "Weak"
}

function Evidence({ label, clips }: { label: string; clips: EvidenceClip[] }) {
  if (clips.length === 0) return null
  return (
    <div className="grid content-start gap-1.5 rounded-[14px] bg-graphite-2 px-3.5 py-3">
      <span className="mono-label">{label}</span>
      <ul className="grid gap-0.5">
        {clips.map((clip) => (
          <li key={clip.id} className="flex items-baseline gap-2">
            {clip.clipId && clip.projectId ? (
              <Link
                href={`/projects/${clip.projectId}/clips/${clip.clipId}`}
                className="min-w-0 truncate hover:underline"
              >
                {clip.title}
              </Link>
            ) : (
              <>
                {clip.url ? (
                  <a
                    href={clip.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate hover:underline"
                  >
                    {clip.title}
                  </a>
                ) : (
                  <span className="min-w-0 truncate">{clip.title}</span>
                )}
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  (posted outside Nimbus)
                </span>
              </>
            )}
            {clip.views !== null && (
              <span className="ms-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {views.format(clip.views)} views
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SuggestionCard({
  suggestion,
  activeRules,
}: {
  suggestion: SuggestionView
  activeRules: RuleView[]
}) {
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(suggestion.text)
  const [picking, setPicking] = React.useState(false)
  const { pending, run } = useInsightAction()

  const current = suggestion.kind === "add" ? null : suggestion.currentRule
  const subject =
    suggestion.kind === "retire" && current ? current.text : suggestion.text
  const edited = editing && text.trim() !== suggestion.text
  const approve = (retireRuleId?: string) =>
    run(
      () =>
        approveSuggestionAction(suggestion.id, {
          ...(edited && { text }),
          ...(retireRuleId && { retireRuleId }),
        }),
      { onCap: () => setPicking(true), onDone: () => setPicking(false) }
    )

  return (
    <article>
      <div
        data-slot="suggestion-card"
        className="grid gap-3.5 rounded-[18px] bg-graphite p-5"
      >
        <div className="contents">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="lav">
              {TARGET_LABELS[suggestion.target]}
            </StatusPill>
            <StatusPill tone="neutral">
              {KIND_LABELS[suggestion.kind]}
            </StatusPill>
            <span className="ms-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <DotMeter
                value={Math.round(suggestion.confidence * 10)}
                aria-label="Confidence"
                tone="mint"
              />
              <span>{confidenceLabel(suggestion.confidence)} evidence</span>
            </span>
          </div>
          {current && (
            <p
              className={
                suggestion.kind === "edit"
                  ? "text-muted-foreground"
                  : "font-medium"
              }
            >
              <span className="text-[13px] text-muted-foreground">
                {suggestion.kind === "edit" ? "Now: " : "Retire: "}
              </span>
              {current.text}
            </p>
          )}
          {suggestion.kind !== "retire" &&
            (editing ? (
              <RuleTextField value={text} onChange={setText} />
            ) : (
              <p className="text-[17px] leading-snug font-semibold tracking-[-0.02em]">
                {suggestion.kind === "edit" && (
                  <span className="text-[13px] font-normal text-muted-foreground">
                    Change to:{" "}
                  </span>
                )}
                {suggestion.text}
              </p>
            ))}
          <p className="text-muted-foreground">{suggestion.rationale}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            <Evidence label="Evidence" clips={suggestion.evidenceFor} />
            <Evidence label="Against" clips={suggestion.evidenceAgainst} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Decision"
              className="flex gap-0.5 rounded-full bg-glass p-[3px] inset-ring-1 inset-ring-hair"
            >
              <Button
                size="sm"
                variant="ghost"
                className="h-[30px] hover:bg-pink/14 hover:text-pink"
                disabled={pending}
                onClick={() => run(() => rejectSuggestionAction(suggestion.id))}
              >
                <XIcon data-icon="inline-start" aria-hidden />
                Reject
                <Subject text={subject} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-[30px] hover:bg-mint/18 hover:text-mint"
                disabled={pending || (editing && text.trim() === "")}
                onClick={() => approve()}
              >
                <CheckIcon data-icon="inline-start" aria-hidden />
                Approve
                <Subject text={subject} />
              </Button>
            </div>
            {suggestion.kind !== "retire" && !editing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
              >
                Edit, then approve
                <Subject text={subject} />
              </Button>
            )}
          </div>
        </div>
      </div>
      <RetirePickDialog
        open={picking}
        onOpenChange={setPicking}
        rules={activeRules}
        confirmLabel="Retire and approve"
        pending={pending}
        onConfirm={approve}
      />
    </article>
  )
}
