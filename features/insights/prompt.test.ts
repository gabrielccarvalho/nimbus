import { describe, expect, it } from "vitest"

import {
  buildInsightsPrompt,
  type ImportedInsightClip,
  type NimbusInsightClip,
} from "./prompt"

function clip(overrides: Partial<NimbusInsightClip> = {}): NimbusInsightClip {
  return {
    origin: "nimbus",
    id: "clip-aaa",
    title: "Clutch",
    hook: "Watch this",
    reason: "Peak",
    score: 0.8,
    niche: "FPS",
    durationMs: 22_000,
    parts: 1,
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
    [clip(), clip({ id: "clip-bbb", relative: null })],
    [{ id: "rule-1", target: "review", text: "Cut dead air" }],
    [{ target: "selection", text: "Always open on a kill" }]
  )

  it("lists each clip id once", () => {
    expect(prompt.match(/clip-aaa/g)).toHaveLength(1)
    expect(prompt.match(/clip-bbb/g)).toHaveLength(1)
  })

  it("gives each clip's length, so clips of similar length can be compared", () => {
    expect(prompt.match(/Duration: 22\.0s/g)).toHaveLength(2)
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

describe("buildInsightsPrompt with imported Shorts", () => {
  const imported: ImportedInsightClip = {
    origin: "imported",
    id: "pub-zzz",
    title: "Old banger",
    durationMs: 45_000,
    moments: [
      {
        atMs: 9000,
        kind: "drop",
        change: -0.2,
        words: "",
        beats: [],
        effects: [],
      },
    ],
    views: 5400,
    averageViewPercentage: 71.2,
    relative: 2.5,
  }
  const prompt = buildInsightsPrompt([clip(), imported], [], [])
  const section = prompt.slice(prompt.indexOf("Short pub-zzz"))

  it("describes the Short by its numbers only", () => {
    expect(section).toContain(
      'Short pub-zzz — "Old banger" (posted outside Nimbus, no transcript)'
    )
    expect(section).toContain("Duration: 45.0s")
    expect(section).toContain(
      "Views: 5400, 2.50x the channel's median at this age"
    )
    expect(section).toContain("Average viewed: 71%")
    expect(section).toContain("- 9.0s drop 20 points")
    expect(section).not.toContain('""')
    expect(section).not.toContain("Hook:")
    expect(section).not.toContain("Transcript:")
  })

  it("warns once before the clip list", () => {
    const note =
      "Shorts posted outside Nimbus have no transcript or edit data; use their numbers, but don't base a rule on what happens in them."
    expect(prompt.split(note)).toHaveLength(2)
    expect(prompt.indexOf(note)).toBeLessThan(prompt.indexOf("Published clips"))
    expect(buildInsightsPrompt([clip()], [], [])).not.toContain(note)
  })
})
