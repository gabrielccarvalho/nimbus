import { describe, expect, it } from "vitest"

import { cleanSuggestions, playbookSection } from "./playbook"
import { RULE_MAX_CHARS, type RawSuggestion } from "./schema"

const known = {
  rules: [
    { id: "r-sel", target: "selection" as const },
    { id: "r-rev", target: "review" as const },
  ],
  clipIds: ["c1", "c2", "c3"],
}

function suggestion(overrides: Partial<RawSuggestion> = {}): RawSuggestion {
  return {
    target: "selection",
    kind: "add",
    ruleId: null,
    text: "Open on the crash",
    rationale: "Crash openings held viewers",
    evidenceFor: ["c1"],
    evidenceAgainst: [],
    confidence: 0.7,
    ...overrides,
  }
}

describe("playbookSection", () => {
  it("is empty with no rules", () => expect(playbookSection([])).toBe(""))

  it("lists rules under one heading", () =>
    expect(playbookSection(["Open on the crash", "Skip menus"])).toBe(
      "What has worked on this channel, learned from how its published clips did:\n- Open on the crash\n- Skip menus\n"
    ))
})

describe("cleanSuggestions", () => {
  it("keeps a valid suggestion", () => {
    const valid = suggestion()
    expect(cleanSuggestions([valid], known)).toEqual([valid])
  })

  it("drops an edit or retire with an unknown rule", () => {
    const raw = [
      suggestion({ kind: "edit", ruleId: "nope" }),
      suggestion({ kind: "retire", ruleId: null }),
    ]
    expect(cleanSuggestions(raw, known)).toEqual([])
  })

  it("drops an edit or retire for a rule of the other target", () => {
    const raw = [
      suggestion({ kind: "edit", ruleId: "r-rev", target: "selection" }),
      suggestion({ kind: "retire", ruleId: "r-sel", target: "review" }),
    ]
    expect(cleanSuggestions(raw, known)).toEqual([])
  })

  it("keeps an edit or retire for a rule of the same target", () => {
    const raw = [
      suggestion({ kind: "edit", ruleId: "r-sel" }),
      suggestion({
        kind: "retire",
        ruleId: "r-rev",
        target: "review",
        text: "",
      }),
    ]
    expect(cleanSuggestions(raw, known)).toHaveLength(2)
  })

  it("drops an add or edit with blank text", () => {
    const raw = [
      suggestion({ text: "   " }),
      suggestion({ kind: "edit", ruleId: "r-sel", text: "" }),
    ]
    expect(cleanSuggestions(raw, known)).toEqual([])
  })

  it("drops an add or edit with text over the limit", () => {
    const raw = [
      suggestion({ text: "a".repeat(RULE_MAX_CHARS + 1) }),
      suggestion({
        kind: "edit",
        ruleId: "r-sel",
        text: "a".repeat(RULE_MAX_CHARS + 1),
      }),
    ]
    expect(cleanSuggestions(raw, known)).toEqual([])
  })

  it("trims text before checking its length", () => {
    const text = "a".repeat(RULE_MAX_CHARS)
    const [kept] = cleanSuggestions(
      [suggestion({ text: `  ${text}  ` })],
      known
    )
    expect(kept?.text).toBe(text)
  })

  it("drops a suggestion with no known evidenceFor clip", () => {
    const raw = [
      suggestion({ evidenceFor: [] }),
      suggestion({ evidenceFor: ["ghost"] }),
      suggestion({ evidenceFor: [], evidenceAgainst: ["c2"] }),
    ]
    expect(cleanSuggestions(raw, known)).toEqual([])
  })

  it("strips unknown clip ids from both evidence lists", () => {
    const [kept] = cleanSuggestions(
      [
        suggestion({
          evidenceFor: ["c1", "ghost"],
          evidenceAgainst: ["x", "c3"],
        }),
      ],
      known
    )
    expect(kept?.evidenceFor).toEqual(["c1"])
    expect(kept?.evidenceAgainst).toEqual(["c3"])
  })

  it("forces ruleId to null on an add", () => {
    const [kept] = cleanSuggestions([suggestion({ ruleId: "r-sel" })], known)
    expect(kept?.ruleId).toBeNull()
  })
})
