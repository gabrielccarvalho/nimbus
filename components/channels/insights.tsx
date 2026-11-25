"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
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
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyDescription>
            Connect YouTube to learn from your published clips.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const blockers = [
    eligible < needed && `${eligible} of ${needed} clips have a week of stats`,
    !claudeAvailable && "Add your Anthropic key in Settings to find patterns",
  ].filter((reason): reason is string => reason !== false)

  return (
    <div className="grid gap-8">
      <section aria-label="Find patterns" className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={running || pending || blockers.length > 0}
            onClick={() => run(() => findPatternsAction())}
          >
            {running ? "Looking for patterns…" : "Find patterns"}
          </Button>
          {blockers.map((reason) => (
            <span key={reason} className="text-[13px] text-muted-foreground">
              {reason}
            </span>
          ))}
        </div>
        {lastError && !running && (
          <p role="alert" className="text-[13px] text-amber">
            {lastError}
          </p>
        )}
      </section>
      {suggestions.length > 0 && (
        <section aria-label="Suggestions" className="grid gap-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              activeRules={rules[suggestion.target]}
            />
          ))}
        </section>
      )}
      <Playbook rules={rules} />
    </div>
  )
}
