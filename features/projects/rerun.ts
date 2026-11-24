import type { ProjectSettings } from "./schema"

export const rerunSteps = ["transcribe", "select", "render"] as const
export type RerunStep = (typeof rerunSteps)[number]

const AFFECTS: Record<RerunStep, readonly (keyof ProjectSettings)[]> = {
  transcribe: ["language", "audioTrack"],
  select: [
    "selectorMode",
    "clipMinMs",
    "clipMaxMs",
    "targetClipCount",
    "reactionPhrases",
    "niche",
  ],
  render: ["captionStyle", "captionsEnabled", "renderQuality", "autoEffects"],
}

export function rerunStepFor(
  previous: ProjectSettings,
  next: ProjectSettings
): RerunStep | null {
  return (
    rerunSteps.find((step) =>
      AFFECTS[step].some(
        (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])
      )
    ) ?? null
  )
}
