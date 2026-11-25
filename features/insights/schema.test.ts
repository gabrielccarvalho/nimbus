import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { describe, expect, it } from "vitest"

import { insightsResponseSchema } from "./schema"

describe("insightsResponseSchema", () => {
  it("builds a structured output format that parses a reply", () => {
    const format = betaZodOutputFormat(insightsResponseSchema)
    const suggestion = {
      target: "selection",
      kind: "add",
      ruleId: null,
      text: "Open on the crash",
      rationale: "Crash openings held viewers",
      evidenceFor: ["c1"],
      evidenceAgainst: [],
      confidence: 0.7,
    }
    expect(format.parse(JSON.stringify({ suggestions: [suggestion] }))).toEqual(
      { suggestions: [suggestion] }
    )
  })
})
