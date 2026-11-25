import "server-only"

import { withTransaction, type Db } from "@/lib/db"
import { AppError } from "@/lib/errors"

import { NICHE_PROFILES, resolveNiche } from "../highlights/niches"
import { transcriptLines } from "../highlights/prompt"
import type { Workspace } from "../accounts/repository"
import { CLAUDE_KEY_MISSING_MESSAGE } from "../accounts/schema"
import { claudeAvailable } from "../accounts/usage"
import { jobQueue } from "../jobs/queue"
import { projectRepository } from "../projects/repository"
import { relativePerformance, retentionMoments } from "../publishing/stats"
import { statsRepository } from "../publishing/stats-repository"
import { transcriptRepository } from "../transcription/repository"
import type { InsightClip } from "./prompt"
import {
  insightsRepository,
  type InsightSuggestion,
  type PlaybookRule,
} from "./repository"
import {
  INSIGHTS_MAX_CLIPS,
  INSIGHTS_MIN_AGE_DAYS,
  INSIGHTS_MIN_CLIPS,
  PLAYBOOK_CAP_MESSAGE,
  PLAYBOOK_RULE_CAP,
  ruleTextSchema,
  type RuleTarget,
} from "./schema"

const DAY_MS = 86_400_000

type Transcript = NonNullable<
  Awaited<ReturnType<ReturnType<typeof transcriptRepository>["get"]>>
>
type ProjectContext = Pick<Transcript, "language" | "words" | "segments"> & {
  niche: string
}

type ChannelPublication = Awaited<
  ReturnType<ReturnType<typeof statsRepository>["forChannel"]>
>[number]
type ClipPublication = ChannelPublication & {
  clip: NonNullable<ChannelPublication["clip"]>
  projectId: string
}

export function withClip(rows: ChannelPublication[]): ClipPublication[] {
  return rows.flatMap(({ clip, projectId, ...row }) =>
    clip && projectId ? [{ ...row, clip, projectId }] : []
  )
}

function insightAgeDays({
  publication,
  latest,
}: ChannelPublication): number | null {
  if (!publication.publishedAt || !latest) return null
  const ageDays =
    (latest.fetchedAt.getTime() - publication.publishedAt.getTime()) / DAY_MS
  return ageDays >= INSIGHTS_MIN_AGE_DAYS ? ageDays : null
}

export function isInsightEligible(row: ChannelPublication): boolean {
  return insightAgeDays(row) !== null
}

export async function eligibleInsightCount(
  db: Db,
  channelId: string
): Promise<number> {
  const rows = await statsRepository(db).forChannel(channelId)
  return withClip(rows).filter(isInsightEligible).length
}

export async function eligibleInsightClips(
  db: Db,
  channelId: string
): Promise<InsightClip[]> {
  const rows = await statsRepository(db).forChannel(channelId)
  const eligible = withClip(rows)
    .flatMap((row) => {
      const ageDays = insightAgeDays(row)
      return ageDays === null
        ? []
        : [{ ...row, snapshot: row.latest!, ageDays }]
    })
    .slice(0, INSIGHTS_MAX_CLIPS)

  const samples = eligible.map((e) => ({
    publicationId: e.publication.id,
    ageDays: e.ageDays,
    views: e.snapshot.views,
  }))
  const projects = projectRepository(db)
  const projectContext = new Map<string, Promise<ProjectContext>>()
  const contextFor = (projectId: string) => {
    let context = projectContext.get(projectId)
    if (!context) {
      context = (async () => {
        const project = await projects.get(projectId)
        const transcript = await transcriptRepository(db).get(projectId)
        const settings = project?.settings
        return {
          niche:
            NICHE_PROFILES[resolveNiche(settings?.niche, project?.name ?? "")]
              .label,
          language: transcript?.language ?? settings?.language ?? "en",
          words: transcript?.words ?? [],
          segments: transcript?.segments ?? [],
        }
      })()
      projectContext.set(projectId, context)
    }
    return context
  }

  return Promise.all(
    eligible.map(async (e, index) => {
      const { clip, publication, snapshot } = e
      const context = await contextFor(e.projectId)
      const range = {
        startMs: publication.clipStartMs ?? clip.startMs,
        endMs: publication.clipEndMs ?? clip.endMs,
      }
      const effects = clip.effects?.events ?? []
      const beats = clip.beats ?? []
      return {
        clipId: clip.id,
        title: clip.title,
        hook: clip.hook,
        reason: clip.reason,
        score: clip.score,
        niche: context.niche,
        transcript: transcriptLines(
          {
            words: context.words,
            segments: context.segments,
            language: context.language,
          },
          range.startMs,
          range.endMs
        ),
        effects: [...new Set(effects.map((effect) => effect.kind))],
        beats: [...new Set(beats.map((beat) => beat.kind))],
        moments: retentionMoments(snapshot.retention ?? [], range, {
          words: context.words,
          beats,
          effects,
        }),
        views: snapshot.views,
        averageViewPercentage: snapshot.averageViewPercentage,
        relative: relativePerformance(samples[index]!, samples),
        ruleIds: clip.playbookRuleIds ?? [],
      }
    })
  )
}

function parseRuleText(text: string) {
  const parsed = ruleTextSchema.safeParse(text)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid rule"
    )
  }
  return parsed.data
}

async function ownedRule(
  repo: ReturnType<typeof insightsRepository>,
  channelId: string,
  ruleId: string
) {
  const rule = await repo.getRule(ruleId)
  if (!rule || rule.channelId !== channelId) {
    throw new AppError("NOT_FOUND", "Rule not found")
  }
  return rule
}

async function makeRoom(
  repo: ReturnType<typeof insightsRepository>,
  channelId: string,
  target: RuleTarget,
  retireRuleId: string | undefined
) {
  if ((await repo.countActive(channelId, target)) < PLAYBOOK_RULE_CAP) return
  if (!retireRuleId) throw new AppError("CONFLICT", PLAYBOOK_CAP_MESSAGE)
  const rule = await repo.getRule(retireRuleId)
  if (
    !rule ||
    rule.channelId !== channelId ||
    rule.target !== target ||
    rule.status !== "active"
  ) {
    throw new AppError(
      "VALIDATION",
      "Pick an active rule from this list to retire"
    )
  }
  await repo.retireRule(rule.id)
}

const alreadyDecided = () =>
  new AppError("CONFLICT", "This suggestion was already decided.")

async function decideSuggestion(
  repo: ReturnType<typeof insightsRepository>,
  channelId: string,
  id: string,
  status: "approved" | "rejected"
): Promise<InsightSuggestion> {
  const suggestion = await repo.getSuggestion(id)
  if (!suggestion || suggestion.channelId !== channelId) {
    throw new AppError("NOT_FOUND", "Suggestion not found")
  }
  if (suggestion.status !== "pending") throw alreadyDecided()
  const decided = await repo.decideSuggestion(id, status)
  if (!decided) throw alreadyDecided()
  return suggestion
}

export function approveSuggestion(
  db: Db,
  channelId: string,
  suggestionId: string,
  options: { text?: string; retireRuleId?: string }
): Promise<void> {
  return withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    const suggestion = await decideSuggestion(
      repo,
      channelId,
      suggestionId,
      "approved"
    )
    const sourceSuggestionId = suggestion.id

    if (suggestion.kind === "add") {
      const text = parseRuleText(options.text ?? suggestion.text)
      await makeRoom(repo, channelId, suggestion.target, options.retireRuleId)
      await repo.insertRule({
        channelId,
        target: suggestion.target,
        text,
        sourceSuggestionId,
      })
    } else {
      const rule = suggestion.ruleId
        ? await repo.getRule(suggestion.ruleId)
        : undefined
      if (!rule || rule.channelId !== channelId || rule.status !== "active") {
        throw new AppError(
          "CONFLICT",
          "That rule changed since this suggestion was made. Run Find patterns again."
        )
      }
      if (suggestion.kind === "edit") {
        const text = parseRuleText(options.text ?? suggestion.text)
        await repo.retireRule(rule.id)
        await repo.insertRule({
          channelId,
          target: rule.target,
          text,
          sourceSuggestionId,
          supersedesId: rule.id,
        })
      } else {
        await repo.retireRule(rule.id)
      }
    }
  })
}

export function rejectSuggestion(
  db: Db,
  channelId: string,
  suggestionId: string
): Promise<void> {
  return withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    await decideSuggestion(repo, channelId, suggestionId, "rejected")
  })
}

export function editRule(
  db: Db,
  channelId: string,
  ruleId: string,
  text: string
): Promise<PlaybookRule> {
  const nextText = parseRuleText(text)
  return withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    const rule = await ownedRule(repo, channelId, ruleId)
    if (rule.status !== "active") {
      throw new AppError("CONFLICT", "Only an active rule can be edited.")
    }
    await repo.retireRule(rule.id)
    return repo.insertRule({
      channelId,
      target: rule.target,
      text: nextText,
      supersedesId: rule.id,
    })
  })
}

export function retireRule(
  db: Db,
  channelId: string,
  ruleId: string
): Promise<void> {
  return withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    const rule = await ownedRule(repo, channelId, ruleId)
    if (rule.status !== "active") {
      throw new AppError("CONFLICT", "This rule is already retired.")
    }
    await repo.retireRule(rule.id)
  })
}

export function restoreRule(
  db: Db,
  channelId: string,
  ruleId: string,
  options: { retireRuleId?: string }
): Promise<void> {
  return withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    const rule = await ownedRule(repo, channelId, ruleId)
    if (rule.status === "active") {
      throw new AppError("CONFLICT", "This rule is already active.")
    }
    await makeRoom(repo, channelId, rule.target, options.retireRuleId)
    await repo.restoreRule(rule.id)
  })
}

export async function findPatterns(
  db: Db,
  workspace: Pick<Workspace, "anthropicKey">,
  channelId: string
): Promise<void> {
  if (!claudeAvailable(workspace)) {
    throw new AppError("DEPENDENCY_MISSING", CLAUDE_KEY_MISSING_MESSAGE)
  }
  const eligible = await eligibleInsightCount(db, channelId)
  if (eligible < INSIGHTS_MIN_CLIPS) {
    throw new AppError(
      "CONFLICT",
      `Finding patterns needs ${INSIGHTS_MIN_CLIPS} clips with stats at least ${INSIGHTS_MIN_AGE_DAYS} days old. You have ${eligible}.`
    )
  }
  await withTransaction(db, async (tx) => {
    const repo = insightsRepository(tx)
    await repo.lockChannel(channelId)
    if (await repo.analysisActive(channelId)) {
      throw new AppError("CONFLICT", "Already looking for patterns")
    }
    await jobQueue(tx).enqueue({
      type: "analyze_performance",
      projectId: null,
      payload: { channelId },
      maxAttempts: 1,
    })
  })
}
