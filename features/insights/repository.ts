import "server-only"

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { newId, now, withTransaction, type Db } from "@/lib/db"
import { insightSuggestions, jobs, playbookRules } from "@/lib/db/schema"

import { publishingRepository } from "../publishing/repository"
import {
  INSIGHTS_MAX_REJECTED,
  type RuleTarget,
  type SuggestionStatus,
} from "./schema"

export type PlaybookRule = typeof playbookRules.$inferSelect
export type NewPlaybookRule = Pick<
  typeof playbookRules.$inferInsert,
  "channelId" | "target" | "text" | "sourceSuggestionId" | "supersedesId"
>
export type InsightSuggestion = typeof insightSuggestions.$inferSelect
export type NewInsightSuggestion = Pick<
  typeof insightSuggestions.$inferInsert,
  | "target"
  | "kind"
  | "ruleId"
  | "text"
  | "rationale"
  | "evidenceFor"
  | "evidenceAgainst"
  | "confidence"
>

export type Playbook = {
  selection: string[]
  review: string[]
  ruleIds: Record<RuleTarget, string[]>
}

export function insightsRepository(db: Db) {
  const setRule = async (id: string, patch: Partial<PlaybookRule>) => {
    const [row] = await db
      .update(playbookRules)
      .set(patch)
      .where(eq(playbookRules.id, id))
      .returning()
    return row!
  }

  return {
    activeRules(channelId: string): Promise<PlaybookRule[]> {
      return db
        .select()
        .from(playbookRules)
        .where(
          and(
            eq(playbookRules.channelId, channelId),
            eq(playbookRules.status, "active")
          )
        )
        .orderBy(asc(playbookRules.createdAt), asc(playbookRules.id))
    },

    rules(channelId: string): Promise<PlaybookRule[]> {
      return db
        .select()
        .from(playbookRules)
        .where(eq(playbookRules.channelId, channelId))
        .orderBy(desc(playbookRules.createdAt), desc(playbookRules.id))
    },

    async getRule(id: string): Promise<PlaybookRule | undefined> {
      const [row] = await db
        .select()
        .from(playbookRules)
        .where(eq(playbookRules.id, id))
      return row
    },

    async insertRule(input: NewPlaybookRule): Promise<PlaybookRule> {
      const [row] = await db
        .insert(playbookRules)
        .values({ ...input, id: newId() })
        .returning()
      return row!
    },

    retireRule(id: string) {
      return setRule(id, { status: "retired", retiredAt: now() })
    },

    restoreRule(id: string) {
      return setRule(id, { status: "active", retiredAt: null })
    },

    countActive(channelId: string, target: RuleTarget) {
      return db.$count(
        playbookRules,
        and(
          eq(playbookRules.channelId, channelId),
          eq(playbookRules.target, target),
          eq(playbookRules.status, "active")
        )
      )
    },

    pendingSuggestions(channelId: string): Promise<InsightSuggestion[]> {
      return db
        .select()
        .from(insightSuggestions)
        .where(
          and(
            eq(insightSuggestions.channelId, channelId),
            eq(insightSuggestions.status, "pending")
          )
        )
        .orderBy(
          desc(insightSuggestions.confidence),
          asc(insightSuggestions.id)
        )
    },

    rejectedSuggestions(channelId: string): Promise<InsightSuggestion[]> {
      return db
        .select()
        .from(insightSuggestions)
        .where(
          and(
            eq(insightSuggestions.channelId, channelId),
            eq(insightSuggestions.status, "rejected")
          )
        )
        .orderBy(desc(insightSuggestions.decidedAt))
        .limit(INSIGHTS_MAX_REJECTED)
    },

    replacePending(channelId: string, suggestions: NewInsightSuggestion[]) {
      return withTransaction(db, async (tx) => {
        await tx
          .delete(insightSuggestions)
          .where(
            and(
              eq(insightSuggestions.channelId, channelId),
              eq(insightSuggestions.status, "pending")
            )
          )
        if (suggestions.length === 0) return
        await tx
          .insert(insightSuggestions)
          .values(suggestions.map((s) => ({ ...s, id: newId(), channelId })))
      })
    },

    async getSuggestion(id: string): Promise<InsightSuggestion | undefined> {
      const [row] = await db
        .select()
        .from(insightSuggestions)
        .where(eq(insightSuggestions.id, id))
      return row
    },

    async analysisActive(channelId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, "analyze_performance"),
            inArray(jobs.status, ["queued", "running"]),
            sql`${jobs.payload}->>'channelId' = ${channelId}`
          )
        )
        .limit(1)
      return row !== undefined
    },

    async lastAnalysisError(channelId: string): Promise<string | null> {
      const [row] = await db
        .select({ status: jobs.status, error: jobs.error })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, "analyze_performance"),
            inArray(jobs.status, ["failed", "succeeded"]),
            sql`${jobs.payload}->>'channelId' = ${channelId}`
          )
        )
        .orderBy(desc(jobs.createdAt))
        .limit(1)
      return row?.status === "failed" ? (row.error ?? "Analysis failed") : null
    },

    async decideSuggestion(
      id: string,
      status: Exclude<SuggestionStatus, "pending">
    ): Promise<InsightSuggestion | undefined> {
      const [row] = await db
        .update(insightSuggestions)
        .set({ status, decidedAt: now() })
        .where(
          and(
            eq(insightSuggestions.id, id),
            eq(insightSuggestions.status, "pending")
          )
        )
        .returning()
      return row
    },

    async lockChannel(channelId: string): Promise<void> {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`playbook:${channelId}`}))`
      )
    },
  }
}

export async function loadPlaybook(
  db: Db,
  workspaceId: string | null
): Promise<Playbook | undefined> {
  if (!workspaceId) return undefined
  const channel = await publishingRepository(db).getChannel(workspaceId)
  if (!channel) return undefined
  const rules = await insightsRepository(db).activeRules(channel.id)
  if (rules.length === 0) return undefined
  const of = (target: RuleTarget) => rules.filter((r) => r.target === target)
  return {
    selection: of("selection").map((r) => r.text),
    review: of("review").map((r) => r.text),
    ruleIds: {
      selection: of("selection").map((r) => r.id),
      review: of("review").map((r) => r.id),
    },
  }
}
