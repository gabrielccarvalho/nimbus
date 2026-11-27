import { describe, expect, it } from "vitest"

import { isLocale, matchLocale } from "./config"
import { defineMessages, plural } from "./messages"

describe("matchLocale", () => {
  it.each([
    ["pt-BR,pt;q=0.9,en-US;q=0.8", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["pt", "pt-BR"],
    ["en-GB,en;q=0.9", "en-US"],
    ["fr-FR,pt;q=0.6,en;q=0.9", "en-US"],
    ["fr-FR,pt;q=0.9,en;q=0.6", "pt-BR"],
    ["es-ES,es;q=0.9", "en-US"],
    ["en;q=0,pt;q=0.1", "pt-BR"],
    ["*", "en-US"],
    ["", "en-US"],
  ])("%s → %s", (header, expected) => {
    expect(matchLocale(header)).toBe(expected)
  })

  it("falls back to en-US without a header", () => {
    expect(matchLocale(null)).toBe("en-US")
    expect(matchLocale(undefined)).toBe("en-US")
  })
})

describe("isLocale", () => {
  it("accepts only the locales we ship", () => {
    expect(isLocale("pt-BR")).toBe(true)
    expect(isLocale("en-US")).toBe(true)
    expect(isLocale("pt")).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe("messages", () => {
  it("returns the dictionary per locale", () => {
    const greeting = defineMessages({
      "en-US": { hello: (name: string) => `Hi, ${name}` },
      "pt-BR": { hello: (name: string) => `Oi, ${name}` },
    })
    expect(greeting["pt-BR"].hello("Ana")).toBe("Oi, Ana")
  })

  it("picks the plural form of the locale", () => {
    const forms = { one: "clip", other: "clips" }
    expect(plural("en-US", 1, forms)).toBe("clip")
    expect(plural("en-US", 0, forms)).toBe("clips")
    // Portuguese counts zero as singular.
    expect(plural("pt-BR", 0, { one: "corte", other: "cortes" })).toBe("corte")
    expect(plural("pt-BR", 2, { one: "corte", other: "cortes" })).toBe("cortes")
  })
})
