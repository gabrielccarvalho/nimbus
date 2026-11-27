"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { findPatternsAction } from "@/features/insights/actions"
import type { getInsights } from "@/features/insights/queries"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"

import { analytics } from "./messages"
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
  const locale = useLocale()
  const router = useRouter()
  const t = useMessages(analytics).insights
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
          <EmptyDescription>{t.connectPrompt}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const blockers = [
    eligible < needed && t.eligible(eligible, needed),
    !claudeAvailable && t.claudeKeyMissing,
  ].filter((reason): reason is string => reason !== false)

  return (
    <div className="grid gap-8">
      <section aria-label={t.findPatterns} className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={running || pending || blockers.length > 0}
            onClick={() => run(() => findPatternsAction())}
          >
            {running ? t.finding : t.findPatterns}
          </Button>
          {blockers.map((reason) => (
            <span key={reason} className="text-[13px] text-muted-foreground">
              {reason}
            </span>
          ))}
        </div>
        {lastError && !running && (
          <p role="alert" className="text-[13px] text-amber">
            {translateError(lastError, locale)}
          </p>
        )}
      </section>
      {suggestions.length > 0 && (
        <section aria-label={t.suggestions} className="grid gap-3">
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
