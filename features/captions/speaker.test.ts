import { describe, expect, it } from "vitest"

import { buildSegments } from "../transcription/normalize"
import type { Word } from "../transcription/schema"
import { isForeignSegment, loopedSegments, speakerWords } from "./speaker"

function transcript(lines: string[], language = "pt") {
  const words: Word[] = []
  let t = 0
  for (const line of lines) {
    for (const text of line.split(" ")) {
      words.push({ text, startMs: t, endMs: t + 200, confidence: 0.9 })
      t += 250
    }
    t += 1500
  }
  return { language, words, segments: buildSegments(words) }
}

describe("isForeignSegment", () => {
  it("flags game dialogue in another language", () => {
    expect(
      isForeignSegment(
        "You're gonna give me some meds or I'm gonna blast you.",
        "pt"
      )
    ).toBe(true)
    expect(isForeignSegment("What?", "pt")).toBe(true)
    expect(isForeignSegment("Is this guy expecting us?", "pt")).toBe(true)
  })

  it("keeps the streamer's language, slang and loanwords", () => {
    expect(isForeignSegment("Que gatilho adaptativo legal, mano.", "pt")).toBe(
      false
    )
    expect(isForeignSegment("Caralho, que headshot!", "pt")).toBe(false)
    expect(isForeignSegment("Ligma", "pt")).toBe(false)
    expect(isForeignSegment("What the hell is that?", "en")).toBe(false)
  })

  it("keeps everything for languages it has no word list for", () => {
    expect(isForeignSegment("What are you talking about?", "ja")).toBe(false)
  })
})

describe("loopedSegments", () => {
  it("drops repeats of a hallucination loop but keeps the first line", () => {
    const { segments } = transcript([
      "Corre, corre!",
      "Ele tá com o Ligma.",
      "Ele tá com o Ligma.",
      "ele tá com o ligma",
      "Ele tá com o Ligma.",
      "Bora.",
    ])
    expect([...loopedSegments(segments)]).toEqual([2, 3, 4])
  })

  it("leaves a line said twice alone", () => {
    const { segments } = transcript(["Não!", "Não!", "Meu Deus."])
    expect(loopedSegments(segments).size).toBe(0)
  })
})

describe("speakerWords", () => {
  it("captions only what the streamer says in their language", () => {
    const words = speakerWords(
      transcript([
        "Cara, olha isso.",
        "I don't do that anymore.",
        "Ele tá com o Ligma.",
        "Ele tá com o Ligma.",
        "Ele tá com o Ligma.",
        "Que isso, mano?",
      ])
    )
    expect(words.map((w) => w.text).join(" ")).toBe(
      "Cara, olha isso. Ele tá com o Ligma. Que isso, mano?"
    )
  })
})
