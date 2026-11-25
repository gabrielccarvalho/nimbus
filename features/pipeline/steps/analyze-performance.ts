import "server-only"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { createClient, requestJson } from "../../highlights/anthropic"
import { cleanSuggestions } from "../../insights/playbook"
import {
  buildInsightsPrompt,
  INSIGHTS_SYSTEM_PROMPT,
} from "../../insights/prompt"
import { insightsRepository } from "../../insights/repository"
import {
  INSIGHTS_MIN_CLIPS,
  insightsResponseSchema,
} from "../../insights/schema"
import { eligibleInsightClips } from "../../insights/service"
import type { JobHandler } from "../../jobs/worker-loop"
import { CLAUDE_KEY_MISSING_MESSAGE } from "../../accounts/schema"
import { recordUsage, resolveAnthropicKey } from "../../accounts/usage"
import { publishingRepository } from "../../publishing/repository"

export const analyzePerformanceStep: JobHandler = async ({
  job,
  db,
  signal,
}) => {
  const channelId = job.payload.channelId
  if (typeof channelId !== "string") {
    throw new AppError("VALIDATION", "Analysis job is missing its channel")
  }
  const channel = await publishingRepository(db).getChannelById(channelId)
  if (!channel) throw new AppError("CANCELLED", "The YouTube channel is gone")

  const clips = await eligibleInsightClips(db, channelId)
  if (clips.length < INSIGHTS_MIN_CLIPS) {
    throw new AppError(
      "VALIDATION",
      `Find patterns needs ${INSIGHTS_MIN_CLIPS} published clips with a week of stats`
    )
  }
  const apiKey = await resolveAnthropicKey(db, channel.workspaceId)
  if (!apiKey) {
    throw new AppError("VALIDATION", CLAUDE_KEY_MISSING_MESSAGE)
  }

  const insights = insightsRepository(db)
  const rules = await insights.activeRules(channelId)
  const rejected = await insights.rejectedSuggestions(channelId)
  const { suggestions } = await requestJson({
    client: createClient(apiKey),
    model: getEnv().ANTHROPIC_MODEL,
    effort: "high",
    system: INSIGHTS_SYSTEM_PROMPT,
    content: buildInsightsPrompt(clips, rules, rejected),
    schema: insightsResponseSchema,
    retryHint: "Reply again with only the JSON, at most 10 suggestions.",
    signal,
    subject: "insight",
  })

  const cleaned = cleanSuggestions(suggestions, {
    rules,
    clipIds: clips.map((clip) => clip.clipId),
  })
  await insights.replacePending(channelId, cleaned)
  await recordUsage(
    db,
    { id: null, workspaceId: channel.workspaceId },
    "claude_run",
    1
  )
}
