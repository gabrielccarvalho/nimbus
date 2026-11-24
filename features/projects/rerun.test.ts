import { describe, expect, it } from "vitest"

import { rerunStepFor } from "./rerun"
import { defaultProjectSettings as base } from "./schema"

describe("rerunStepFor", () => {
  it("is null when nothing changed", () => {
    expect(rerunStepFor(base, { ...base })).toBeNull()
  })

  it("re-transcribes for language and voice track", () => {
    expect(rerunStepFor(base, { ...base, language: "pt" })).toBe("transcribe")
    expect(rerunStepFor(base, { ...base, audioTrack: 1 })).toBe("transcribe")
  })

  it("re-selects for highlight options", () => {
    expect(rerunStepFor(base, { ...base, selectorMode: "anthropic" })).toBe(
      "select"
    )
    expect(rerunStepFor(base, { ...base, targetClipCount: 3 })).toBe("select")
  })

  it("autoEffects change asks for the render step", () => {
    expect(
      rerunStepFor(base, { ...base, autoEffects: !base.autoEffects })
    ).toBe("render")
  })

  it("re-renders for captions and quality", () => {
    expect(rerunStepFor(base, { ...base, renderQuality: "high" })).toBe(
      "render"
    )
    expect(
      rerunStepFor(base, {
        ...base,
        captionStyle: { presetId: "punch", overrides: { fontSize: 80 } },
      })
    ).toBe("render")
  })

  it("picks the earliest step when several change", () => {
    expect(
      rerunStepFor(base, { ...base, language: "pt", renderQuality: "high" })
    ).toBe("transcribe")
  })
})
