import { z } from "zod"

export const ruleTargets = ["selection", "review"] as const
export type RuleTarget = (typeof ruleTargets)[number]

export const suggestionKinds = ["add", "edit", "retire"] as const
export type SuggestionKind = (typeof suggestionKinds)[number]

export const suggestionStatuses = ["pending", "approved", "rejected"] as const
export type SuggestionStatus = (typeof suggestionStatuses)[number]

export const PLAYBOOK_RULE_CAP = 12
export const RULE_MAX_CHARS = 200
export const INSIGHTS_MIN_CLIPS = 8
export const INSIGHTS_MIN_AGE_DAYS = 7

export const ruleTextSchema = z
  .string()
  .trim()
  .min(1, "Write the rule")
  .max(RULE_MAX_CHARS)

export const insightsResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        target: z.enum(ruleTargets),
        kind: z.enum(suggestionKinds),
        ruleId: z.string().nullable(),
        text: z.string(),
        rationale: z.string(),
        evidenceFor: z.array(z.string()),
        evidenceAgainst: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(10),
})
export type RawSuggestion = z.infer<
  typeof insightsResponseSchema
>["suggestions"][number]
