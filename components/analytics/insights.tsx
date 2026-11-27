"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { LightbulbIcon, SparkleIcon } from "@phosphor-icons/react"

import { AppHeaderState } from "@/components/app-shell/app-header"
import {
  HEADER_STATE_SLOT_ID,
  HeaderSlot,
} from "@/components/app-shell/header-slot"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { CLAUDE_KEY_MISSING_MESSAGE } from "@/features/accounts/schema"
import { findPatternsAction } from "@/features/insights/actions"
import type { getInsights } from "@/features/insights/queries"

import { Playbook } from "./playbook"
import { SuggestionCard } from "./suggestion-card"
import { useInsightAction } from "./use-insight-action"

const POLL_MS = 5000

export function Insights({
  channel,
  eligible,
  needed,
  claudeAvailable,
  running,
  lastError,
  suggestions,
  rules,
}: Awaited<ReturnType<typeof getInsights>>) {
  const router = useRouter()
  const { pending, run } = useInsightAction()

  React.useEffect(() => {
    if (!running) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [running, router])

  if (!channel) {
    return (
      <div className="p-[18px]">
        <Empty className="rounded-[18px] bg-graphite">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LightbulbIcon />
            </EmptyMedia>
            <EmptyTitle>No channel connected</EmptyTitle>
            <EmptyDescription>
              Connect YouTube to learn from your published clips.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const blockers = [
    eligible < needed && `${eligible} of ${needed} clips have a week of stats`,
    !claudeAvailable && CLAUDE_KEY_MISSING_MESSAGE,
  ].filter((reason): reason is string => reason !== false)

  return (
    <div className="flex min-w-0 flex-1 flex-wrap">
      <HeaderSlot target={HEADER_STATE_SLOT_ID}>
        <AppHeaderState role="status">
          ·{" "}
          {running
            ? "Looking for patterns…"
            : `${suggestions.length} ${suggestions.length === 1 ? "suggestion" : "suggestions"} to review`}
        </AppHeaderState>
      </HeaderSlot>
      <div className="grid min-w-0 flex-[999_1_520px] content-start gap-[18px] p-[18px]">
        <section aria-label="Find patterns" className="grid gap-2.5">
          <p className="max-w-[62ch] text-[13.5px] text-muted-foreground">
            Claude compares your published clips and suggests rules. Approved
            rules join the playbook, which steers how the next recordings are
            picked and edited.{" "}
            <b className="font-medium text-foreground">
              Nothing changes until you approve it.
            </b>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={running || pending || blockers.length > 0}
              onClick={() => run(() => findPatternsAction())}
            >
              <SparkleIcon data-icon="inline-start" aria-hidden />
              {running ? "Looking for patterns…" : "Find patterns"}
            </Button>
            {blockers.map((reason) => (
              <span key={reason} className="text-[13px] text-muted-foreground">
                {reason}
              </span>
            ))}
          </div>
          {lastError && !running && (
            <p role="alert" className="text-[13px] text-pink">
              {lastError}
            </p>
          )}
        </section>
        {suggestions.length > 0 ? (
          <section aria-label="Suggestions" className="grid gap-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                activeRules={rules[suggestion.target]}
              />
            ))}
          </section>
        ) : (
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LightbulbIcon />
              </EmptyMedia>
              <EmptyTitle>No suggestions waiting</EmptyTitle>
              <EmptyDescription>
                Run Find patterns after a few clips have a week of stats. What
                Claude suggests shows up here for you to approve or reject.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <aside
        aria-label="Playbook"
        className="flex min-w-0 flex-[1_0_340px] flex-col gap-3 p-4 lg:max-w-[340px] lg:shadow-[inset_1px_0_0_var(--hair)]"
      >
        <h2 className="mono-label">Playbook</h2>
        <Playbook rules={rules} />
        <p className="mt-auto pt-3 text-[12.5px] text-tertiary">
          Each list holds up to 12 rules. They apply to new recordings, not to
          clips you already made.
        </p>
      </aside>
    </div>
  )
}
