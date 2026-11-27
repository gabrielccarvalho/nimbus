"use client"

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { analytics } from "./messages"
import { RetirePickDialog, RuleTextField, Subject } from "./playbook"
import { useInsightAction } from "./use-insight-action"

function confidenceKey(confidence: number) {
  if (confidence >= 0.7) return "strong"
  if (confidence >= 0.4) return "moderate"
  return "weak"
}

function Evidence({ label, clips }: { label: string; clips: EvidenceClip[] }) {
  const t = useMessages(analytics).suggestion
  if (clips.length === 0) return null
  return (
    <div className="grid gap-1">
      <span className="text-[13px] text-muted-foreground">{label}</span>
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
                  {t.imported}
                </span>
              </>
            )}
            {clip.views !== null && (
              <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                {t.views(clip.views)}
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
  const messages = useMessages(analytics)
  const t = messages.suggestion
  const c = useMessages(common)

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
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="lav">
              {messages.playbook.targets[suggestion.target]}
            </StatusPill>
            <StatusPill tone="neutral">{t.kinds[suggestion.kind]}</StatusPill>
            <span className="ms-auto text-[13px] text-muted-foreground">
              {t[confidenceKey(suggestion.confidence)]}
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
                {suggestion.kind === "edit" ? t.now : t.retire}{" "}
              </span>
              {current.text}
            </p>
          )}
          {suggestion.kind !== "retire" &&
            (editing ? (
              <RuleTextField value={text} onChange={setText} />
            ) : (
              <p className="font-medium">
                {suggestion.kind === "edit" && (
                  <span className="text-[13px] font-normal text-muted-foreground">
                    {t.changeTo}{" "}
                  </span>
                )}
                {suggestion.text}
              </p>
            ))}
          <p className="text-muted-foreground">{suggestion.rationale}</p>
          <Evidence label={t.evidence} clips={suggestion.evidenceFor} />
          <Evidence label={t.against} clips={suggestion.evidenceAgainst} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={pending || (editing && text.trim() === "")}
              onClick={() => approve()}
            >
              {c.approve}
              <Subject text={subject} />
            </Button>
            {suggestion.kind !== "retire" && !editing && (
              <Button size="sm" onClick={() => setEditing(true)}>
                {t.editThenApprove}
                <Subject text={subject} />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => rejectSuggestionAction(suggestion.id))}
            >
              {c.reject}
              <Subject text={subject} />
            </Button>
          </div>
        </CardContent>
      </Card>
      <RetirePickDialog
        open={picking}
        onOpenChange={setPicking}
        rules={activeRules}
        confirmLabel={t.retireAndApprove}
        pending={pending}
        onConfirm={approve}
      />
    </article>
  )
}
