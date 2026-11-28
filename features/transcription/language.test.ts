import { describe, expect, it } from "vitest"

import {
  detectionWindows,
  normalizeLanguage,
  pickLanguage,
  resolveLanguage,
  whisperLanguageCode,
} from "./language"

describe("normalizeLanguage", () => {
  it("keeps the primary subtag", () => {
    expect(normalizeLanguage("pt-BR")).toBe("pt")
    expect(normalizeLanguage("EN_us")).toBe("en")
    expect(normalizeLanguage("es")).toBe("es")
  })

  it("rejects empty and non-language codes", () => {
    expect(normalizeLanguage(null)).toBeNull()
    expect(normalizeLanguage("")).toBeNull()
    expect(normalizeLanguage("und")).toBeNull()
    expect(normalizeLanguage("auto")).toBeNull()
  })
})

describe("whisperLanguageCode", () => {
  it("maps whisper's language names to codes", () => {
    expect(whisperLanguageCode("Portuguese")).toBe("pt")
    expect(whisperLanguageCode("english")).toBe("en")
    expect(whisperLanguageCode("haitian creole")).toBe("ht")
  })

  it("passes codes through and rejects the unknown", () => {
    expect(whisperLanguageCode("pt")).toBe("pt")
    expect(whisperLanguageCode("klingon")).toBeNull()
    expect(whisperLanguageCode(undefined)).toBeNull()
  })
})

describe("detectionWindows", () => {
  it("uses the start for short recordings", () => {
    expect(detectionWindows(45_000)).toEqual([0])
  })

  it("spreads windows across long recordings", () => {
    const windows = detectionWindows(3 * 3_600_000)
    expect(windows).toHaveLength(7)
    expect(windows[0]).toBeGreaterThan(0)
    expect(windows.at(-1)! + 30_000).toBeLessThanOrEqual(3 * 3_600_000)
    expect([...windows].sort((a, b) => a - b)).toEqual(windows)
  })
})

describe("pickLanguage", () => {
  it("takes the probability-weighted majority", () => {
    expect(
      pickLanguage([
        { language: "en", probability: 0.9 },
        { language: "pt", probability: 0.95 },
        { language: "pt", probability: 0.8 },
        { language: "en", probability: 0.3 },
        { language: "pt", probability: 0.99 },
      ])
    ).toEqual({ language: "pt", confidence: expect.closeTo(2.74 / 3.94, 3) })
  })

  it("lets one confident window beat several unsure ones", () => {
    expect(
      pickLanguage([
        { language: "en", probability: 0.2 },
        { language: "en", probability: 0.2 },
        { language: "pt", probability: 0.97 },
      ])?.language
    ).toBe("pt")
  })

  it("returns null with no votes", () => {
    expect(pickLanguage([])).toBeNull()
  })
})

describe("resolveLanguage", () => {
  it("prefers an explicit setting", () => {
    expect(resolveLanguage({ setting: "es", sourceLanguage: "pt-BR" })).toEqual(
      {
        language: "es",
        source: "setting",
      }
    )
  })

  it("falls back to the source's language on auto", () => {
    expect(
      resolveLanguage({ setting: "auto", sourceLanguage: "pt-BR" })
    ).toEqual({ language: "pt", source: "source" })
  })

  it("leaves detection to whisper when nothing is known", () => {
    expect(
      resolveLanguage({ setting: "auto", sourceLanguage: null })
    ).toBeNull()
  })
})
