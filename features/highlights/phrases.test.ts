import { describe, expect, it } from "vitest"

import {
  countPhrases,
  isExclamation,
  isLaughter,
  normalizeText,
  reactionPhrases,
} from "./phrases"

describe("reaction phrases", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeText("Não, ACREDITO!!")).toBe("nao acredito")
  })

  it("picks the list for the spoken language plus catchphrases", () => {
    const pt = reactionPhrases("pt", ["Bora Bill"])
    expect(pt).toContain("meu deus")
    expect(pt).toContain("bora bill")
    expect(pt).not.toContain("no way")
    expect(reactionPhrases("xx", ["só isso"])).toEqual(["so isso"])
  })

  it("counts whole phrases only", () => {
    const phrases = reactionPhrases("pt")
    expect(countPhrases("Meu Deus! Meu deus, olha isso", phrases)).toBe(3)
    expect(countPhrases("bananossa", phrases)).toBe(0)
  })
})

describe("laughter and exclamations", () => {
  it("recognizes laughter in several languages", () => {
    for (const word of [
      "hahaha",
      "KKKKK",
      "jajaja",
      "rsrsrs",
      "(risos)",
      "[laughs]",
    ]) {
      expect(isLaughter(word), word).toBe(true)
    }
    for (const word of ["haha's", "kk", "hat", "jaula"]) {
      expect(isLaughter(word), word).toBe(false)
    }
  })

  it("spots exclamations", () => {
    expect(isExclamation("vai!")).toBe(true)
    expect(isExclamation("¡vamos")).toBe(true)
    expect(isExclamation("vai")).toBe(false)
  })
})
