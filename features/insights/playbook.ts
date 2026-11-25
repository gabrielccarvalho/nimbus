import { RULE_MAX_CHARS, type RawSuggestion, type RuleTarget } from "./schema"

export function playbookSection(rules: readonly string[]): string {
  if (rules.length === 0) return ""
  return `What has worked on this channel, learned from how its published clips did:\n${rules.map((rule) => `- ${rule}`).join("\n")}\n`
}

export function cleanSuggestions(
  raw: RawSuggestion[],
  known: { rules: { id: string; target: RuleTarget }[]; clipIds: string[] }
): RawSuggestion[] {
  const clipIds = new Set(known.clipIds)
  const ruleTargets = new Map(known.rules.map((rule) => [rule.id, rule.target]))
  const cleaned: RawSuggestion[] = []

  for (const suggestion of raw) {
    const text = suggestion.text.trim()
    if (suggestion.kind !== "retire" && (!text || text.length > RULE_MAX_CHARS))
      continue

    if (suggestion.kind !== "add") {
      const target = suggestion.ruleId
        ? ruleTargets.get(suggestion.ruleId)
        : undefined
      if (target !== suggestion.target) continue
    }

    const evidenceFor = suggestion.evidenceFor.filter((id) => clipIds.has(id))
    if (evidenceFor.length === 0) continue

    cleaned.push({
      ...suggestion,
      ruleId: suggestion.kind === "add" ? null : suggestion.ruleId,
      text,
      evidenceFor,
      evidenceAgainst: suggestion.evidenceAgainst.filter((id) =>
        clipIds.has(id)
      ),
    })
  }

  return cleaned
}
