import type { RetentionMoment } from "../publishing/stats"
import { PLAYBOOK_RULE_CAP, RULE_MAX_CHARS, type RuleTarget } from "./schema"

export type NimbusInsightClip = {
  origin: "nimbus"
  id: string
  title: string
  hook: string
  reason: string
  score: number
  niche: string
  durationMs: number
  parts: number
  transcript: string
  effects: string[]
  beats: string[]
  moments: RetentionMoment[]
  views: number
  averageViewPercentage: number | null
  relative: number | null
  ruleIds: string[]
}

export type ImportedInsightClip = {
  origin: "imported"
  id: string
  title: string
  durationMs: number | null
  moments: RetentionMoment[]
  views: number
  averageViewPercentage: number | null
  relative: number | null
}

export type InsightClip = NimbusInsightClip | ImportedInsightClip

const IMPORTED_NOTE =
  "Shorts posted outside Nimbus have no transcript or edit data; use their numbers, but don't base a rule on what happens in them."

export const INSIGHTS_SYSTEM_PROMPT = `You study how a channel's published short-form clips performed and turn the patterns into short rules that steer how future clips are made.

Find what separates the clips that held viewers from the ones that didn't. Look at views against the channel's other clips of the same age, the average percentage viewed, and the retention moments: where viewers dropped off or came back, with the words, beats and effects at that point.

How to read the numbers:
- Average percentage viewed says more about the clip itself than views do. Compare it between clips of similar length, since a longer clip holds a smaller share.
- Every clip loses the most viewers in its first seconds. Compare the size of that drop between clips: a bigger one means the opening was slow, or didn't show what the title and hook promised.
- A flat stretch is viewers held, and a slow decline is normal. A rise is viewers rewatching or sharing that moment. A dip is viewers skipping or leaving: look at what was said and shown right there.
- A drop near the end usually means the clip signalled it was over or ran past its payoff.
- When the same kind of clip keeps doing worse than it used to, the format is wearing out, which is a reason to pick it less often, not to edit it differently.

There are two kinds of rules:
- selection rules steer which moments get picked from a long recording.
- review rules steer the final edit: the hook, the beats and how the clip is cut.

Each rule is one instruction of at most ${RULE_MAX_CHARS} characters, written so a clip picker can follow it without seeing the data. A suggestion is one of:
- add: a new rule.
- edit: a better wording for an existing rule, giving its id in ruleId.
- retire: drop an existing rule that the evidence contradicts or that never mattered, giving its id in ruleId.

For every suggestion cite the clip ids that support it in evidenceFor and the ones that argue against it in evidenceAgainst. Use only clip or Short ids from the list. Prefer editing or retiring a rule over adding a near-duplicate of one that exists. Don't repeat anything listed as already rejected.

A handful of clips is a weak sample, and views depend on luck as much as on the edit. Suggest nothing when the evidence is weak; an empty list is a good answer.`

const seconds = (ms: number) => (ms / 1000).toFixed(1)

const numbers = (clip: InsightClip) => [
  `Views: ${clip.views}${clip.relative === null ? "" : `, ${clip.relative.toFixed(2)}x the channel's median at this age`}`,
  `Average viewed: ${clip.averageViewPercentage === null ? "unknown" : `${clip.averageViewPercentage.toFixed(0)}%`}`,
]

function momentLines(moments: RetentionMoment[], withWords: boolean) {
  if (moments.length === 0) return ["Retention moments: none recorded"]
  return [
    "Retention moments:",
    ...moments.map(
      (moment) =>
        `- ${seconds(moment.atMs)}s ${moment.kind} ${Math.round(Math.abs(moment.change) * 100)} points${withWords ? `: "${moment.words}"` : ""}${moment.beats.length ? ` beats: ${moment.beats.join(", ")}` : ""}${moment.effects.length ? ` effects: ${moment.effects.join(", ")}` : ""}`
    ),
  ]
}

function describeClip(clip: InsightClip) {
  if (clip.origin === "imported") {
    return [
      `Short ${clip.id} — "${clip.title}" (posted outside Nimbus, no transcript)`,
      `Duration: ${clip.durationMs === null ? "unknown" : `${seconds(clip.durationMs)}s`}`,
      ...numbers(clip),
      ...momentLines(clip.moments, false),
    ].join("\n")
  }
  return [
    `Clip ${clip.id} — "${clip.title}" (${clip.niche})`,
    `Duration: ${seconds(clip.durationMs)}s${clip.parts > 1 ? `, joined from ${clip.parts} parts of the recording` : ""}`,
    `Hook: ${clip.hook || "none"}`,
    `Picked because: ${clip.reason || "n/a"} (score ${clip.score.toFixed(2)})`,
    ...numbers(clip),
    `Effects: ${clip.effects.join(", ") || "none"}`,
    `Beats: ${clip.beats.join(", ") || "none"}`,
    `Rules applied: ${clip.ruleIds.join(", ") || "none"}`,
    ...momentLines(clip.moments, true),
    "Transcript:",
    clip.transcript,
  ].join("\n")
}

export function buildInsightsPrompt(
  clips: InsightClip[],
  rules: { id: string; target: RuleTarget; text: string }[],
  rejected: { target: RuleTarget; text: string }[]
): string {
  const sections = [
    `Current rules (at most ${PLAYBOOK_RULE_CAP} per target; each at most ${RULE_MAX_CHARS} characters):`,
    rules.length > 0
      ? rules.map((r) => `- ${r.id} [${r.target}] ${r.text}`).join("\n")
      : "(none yet)",
  ]
  if (rejected.length > 0) {
    sections.push(
      "Already rejected, don't suggest again:",
      rejected.map((r) => `- [${r.target}] ${r.text}`).join("\n")
    )
  }
  if (clips.some((clip) => clip.origin === "imported")) {
    sections.push(IMPORTED_NOTE)
  }
  sections.push(
    `Published clips (${clips.length}):`,
    clips.map(describeClip).join("\n\n")
  )
  return sections.join("\n\n")
}
