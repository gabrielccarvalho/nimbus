import { describe, expect, it } from "vitest"

import { buildInsightsPrompt, type InsightClip } from "./prompt"

function clip(overrides: Partial<InsightClip> = {}): InsightClip {
  return {
    clipId: "clip-aaa",
    title: "Clutch",
    hook: "Watch this",
    reason: "Peak",
    score: 0.8,
    niche: "FPS",
    transcript: "[0.0–2.0] go go",
    effects: ["zoom"],
    beats: ["hook"],
    moments: [
      {
        atMs: 3000,
        kind: "drop",
        change: -0.12,
        words: "so anyway",
        beats: [],
        effects: [],
      },
    ],
    views: 1200,
    averageViewPercentage: 64.5,
    relative: 1.4,
    ruleIds: [],
    ...overrides,
  }
}

describe("buildInsightsPrompt", () => {
  const prompt = buildInsightsPrompt(
    [clip(), clip({ clipId: "clip-bbb", relative: null })],
    [{ id: "rule-1", target: "review", text: "Cut dead air" }],
    [{ target: "selection", text: "Always open on a kill" }]
  )

  it("lists each clip id once", () => {
    expect(prompt.match(/clip-aaa/g)).toHaveLength(1)
    expect(prompt.match(/clip-bbb/g)).toHaveLength(1)
  })

  it("lists the current rules with ids and targets", () => {
    expect(prompt).toContain("rule-1")
    expect(prompt).toContain("review")
    expect(prompt).toContain("Cut dead air")
  })

  it("lists rejected texts under their heading", () => {
    const [, rejected] = prompt.split("Already rejected, don't suggest again")
    expect(rejected).toContain("Always open on a kill")
  })

  it("states the length limit and the per-target cap", () => {
    expect(prompt).toContain("200 characters")
    expect(prompt).toContain("12")
  })

  it("leaves out the rejected heading when nothing was rejected", () => {
    expect(buildInsightsPrompt([clip()], [], [])).not.toContain(
      "Already rejected"
    )
  })
})
