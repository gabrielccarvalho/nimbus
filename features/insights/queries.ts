import "server-only"

import { connection } from "next/server"

import { claudeAvailable } from "@/features/accounts/usage"
import { requireViewer } from "@/features/accounts/session"
import { getDb } from "@/lib/db"

import { publishingRepository } from "../publishing/repository"
import { statsRepository } from "../publishing/stats-repository"
import {
  insightsRepository,
  type InsightSuggestion,
  type PlaybookRule,
} from "./repository"
import { INSIGHTS_MIN_CLIPS } from "./schema"
import { isInsightEligible } from "./service"

export type EvidenceClip = {
  id: string
  title: string
  clipId: string | null
  projectId: string | null
  url: string | null
  views: number | null
}

export type SuggestionView = Omit<
  InsightSuggestion,
  "evidenceFor" | "evidenceAgainst"
> & {
  evidenceFor: EvidenceClip[]
  evidenceAgainst: EvidenceClip[]
  currentRule: { id: string; text: string } | null
}

export type RuleView = Pick<
  PlaybookRule,
  "id" | "target" | "text" | "supersedesId" | "createdAt" | "retiredAt"
>

const ruleView = ({
  id,
  target,
  text,
  supersedesId,
  createdAt,
  retiredAt,
}: PlaybookRule): RuleView => ({
  id,
  target,
  text,
  supersedesId,
  createdAt,
  retiredAt,
})

export async function getInsights() {
  await connection()
  const { workspace } = await requireViewer()
  const db = getDb()
  const channel = await publishingRepository(db).getChannel(workspace.id)
  const empty = {
    channel: null,
    eligible: 0,
    needed: INSIGHTS_MIN_CLIPS,
    claudeAvailable: claudeAvailable(),
    running: false,
    lastError: null,
    suggestions: [] as SuggestionView[],
    rules: {
      selection: [] as RuleView[],
      review: [] as RuleView[],
      retired: [] as RuleView[],
    },
  }
  if (!channel) return empty

  const insights = insightsRepository(db)
  const [running, lastError, pending, rules, rows] = await Promise.all([
    insights.analysisActive(channel.id),
    insights.lastAnalysisError(channel.id),
    insights.pendingSuggestions(channel.id),
    insights.rules(channel.id),
    statsRepository(db).forChannel(channel.id),
  ])
  const clipsById = new Map(
    rows.map(({ publication, clip, projectId, latest }) => {
      const id = clip?.id ?? publication.id
      return [
        id,
        {
          id,
          title: clip?.title ?? publication.metadata.title,
          clipId: clip?.id ?? null,
          projectId,
          url: publication.url,
          views: latest?.views ?? null,
        } satisfies EvidenceClip,
      ]
    })
  )
  const ruleTexts = new Map(rules.map((r) => [r.id, r.text]))
  const currentRule = (ruleId: string | null) => {
    const text = ruleId ? ruleTexts.get(ruleId) : undefined
    return ruleId && text !== undefined ? { id: ruleId, text } : null
  }
  const evidence = (ids: string[]) =>
    ids.flatMap((id) => {
      const clip = clipsById.get(id)
      return clip ? [clip] : []
    })

  return {
    ...empty,
    channel: { title: channel.title },
    eligible: rows.filter(isInsightEligible).length,
    running,
    lastError,
    suggestions: pending.map((s): SuggestionView => ({
      ...s,
      evidenceFor: evidence(s.evidenceFor),
      evidenceAgainst: evidence(s.evidenceAgainst),
      currentRule: currentRule(s.ruleId),
    })),
    rules: {
      selection: rules
        .filter((r) => r.status === "active" && r.target === "selection")
        .map(ruleView),
      review: rules
        .filter((r) => r.status === "active" && r.target === "review")
        .map(ruleView),
      retired: rules.filter((r) => r.status === "retired").map(ruleView),
    },
  }
}
