"use server"

import { z } from "zod"

import { requireActor } from "../accounts/session"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { idSchema, parseId, runAction } from "@/lib/server-action"

import { publishingRepository } from "../publishing/repository"
import { ruleTextSchema } from "./schema"
import {
  approveSuggestion,
  editRule,
  findPatterns,
  rejectSuggestion,
  restoreRule,
  retireRule,
} from "./service"

const INSIGHTS_PATH = "/analytics/insights"

const approveInputSchema = z.object({
  text: ruleTextSchema.optional(),
  retireRuleId: idSchema.optional(),
})

function parseInput<T>(schema: z.ZodType<T>, input: unknown, label: string) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? `Invalid ${label}`
    )
  }
  return parsed.data
}

async function viewerChannel() {
  const { workspace } = await requireActor()
  const channel = await publishingRepository(getDb()).getChannel(workspace.id)
  if (!channel) throw new AppError("NOT_FOUND", "Channel not found")
  return { workspace, channel }
}

export async function approveSuggestionAction(
  suggestionId: unknown,
  input: unknown
) {
  const id = parseId(suggestionId, "suggestion id")
  return runAction(
    "approveSuggestion",
    async () => {
      const options = parseInput(approveInputSchema, input ?? {}, "approval")
      const { channel } = await viewerChannel()
      await approveSuggestion(getDb(), channel.id, id, options)
    },
    [INSIGHTS_PATH]
  )
}

export async function rejectSuggestionAction(suggestionId: unknown) {
  const id = parseId(suggestionId, "suggestion id")
  return runAction(
    "rejectSuggestion",
    async () => {
      const { channel } = await viewerChannel()
      await rejectSuggestion(getDb(), channel.id, id)
    },
    [INSIGHTS_PATH]
  )
}

export async function editRuleAction(ruleId: unknown, text: unknown) {
  const id = parseId(ruleId, "rule id")
  return runAction(
    "editRule",
    async () => {
      const nextText = parseInput(ruleTextSchema, text, "rule")
      const { channel } = await viewerChannel()
      const rule = await editRule(getDb(), channel.id, id, nextText)
      return { ruleId: rule.id }
    },
    [INSIGHTS_PATH]
  )
}

export async function retireRuleAction(ruleId: unknown) {
  const id = parseId(ruleId, "rule id")
  return runAction(
    "retireRule",
    async () => {
      const { channel } = await viewerChannel()
      await retireRule(getDb(), channel.id, id)
    },
    [INSIGHTS_PATH]
  )
}

export async function restoreRuleAction(ruleId: unknown, input: unknown) {
  const id = parseId(ruleId, "rule id")
  return runAction(
    "restoreRule",
    async () => {
      const options = parseInput(
        z.object({ retireRuleId: idSchema.optional() }),
        input ?? {},
        "restore"
      )
      const { channel } = await viewerChannel()
      await restoreRule(getDb(), channel.id, id, options)
    },
    [INSIGHTS_PATH]
  )
}

export async function findPatternsAction() {
  return runAction(
    "findPatterns",
    async () => {
      const { workspace, channel } = await viewerChannel()
      await findPatterns(getDb(), workspace, channel.id)
    },
    [INSIGHTS_PATH]
  )
}
