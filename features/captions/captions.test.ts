import { describe, expect, it } from "vitest"

import { defaultProjectSettings } from "../projects/schema"
import { assTime, buildAss, escapeAssText } from "./ass"
import {
  defaultOverlayText,
  overlayEndMs,
  overlayFontSize,
  textOverlaySchema,
} from "./overlay"
import {
  activeWordIndex,
  applyPageOverrides,
  breakLines,
  buildCaptionPages,
  clipCaptionPages,
  clipCaptionsEnabled,
  DEFAULT_PAGING,
  pageAt,
  sampleCaptionWords,
  spokenEnd,
  wordsInRange,
  type CaptionWord,
} from "./pages"
import {
  assColor,
  captionBaseline,
  placeCaption,
  oklchToRgb,
  resolveCaptionStyle,
} from "./styles"

const w = (text: string, startMs: number, endMs: number): CaptionWord => ({
  text,
  startMs,
  endMs,
})

const sample = [
  w("Wait,", 0, 300),
  w("what", 320, 600),
  w("just", 620, 800),
  w("happened?", 820, 1300),
  w("Did", 2400, 2600),
  w("you", 2620, 2800),
  w("see", 2820, 3000),
  w("that", 3020, 3300),
  w("insane", 3320, 3700),
  w("clutch", 3720, 4200),
]

describe("breakLines", () => {
  it("keeps short text on one line and balances two lines", () => {
    expect(breakLines(["one", "two"], 28, 2)).toEqual([2])
    expect(breakLines(["aaaa", "bb", "cccc", "dd"], 8, 2)).toEqual([2, 2])
    expect(breakLines(["aaaa", "bbbb", "cccc"], 9, 2)).toEqual([2, 1])
  })

  it("gives up when the words can't fit", () => {
    expect(breakLines(["aaaa", "bbbb", "cccc"], 4, 2)).toBeNull()
    expect(breakLines(["aaaa", "bbbb"], 4, 1)).toBeNull()
  })

  it("lets a single long word overflow its own line", () => {
    expect(breakLines(["supercalifragilistic"], 8, 2)).toEqual([1])
    expect(breakLines(["supercalifragilistic", "ok"], 8, 2)).toEqual([1, 1])
  })
})

describe("buildCaptionPages", () => {
  it("breaks on sentence ends, silences and word limits", () => {
    const pages = buildCaptionPages(sample, 5000, { maxWordsPerPage: 4 })
    expect(pages.map((p) => p.words.map((x) => x.text).join(" "))).toEqual([
      "Wait, what just happened?",
      "Did you see that",
      "insane clutch",
    ])
  })

  it("never crosses a long gap and holds pages until the next one", () => {
    const pages = buildCaptionPages(sample, 5000)
    expect(pages[0]!.endMs).toBe(1600)
    expect(pages[1]!.startMs).toBe(2400)
    expect(pages[1]!.endMs).toBe(pages[2]!.startMs)
    expect(pages.at(-1)!.endMs).toBe(4500)
  })

  it("clears the screen when a word is stretched over a silence", () => {
    const pages = buildCaptionPages(
      [w("então", 0, 300), w("conhecessem,", 320, 7480), w("né?", 7500, 7800)],
      9000
    )
    expect(pages.map((p) => p.words.map((x) => x.text).join(" "))).toEqual([
      "então conhecessem,",
      "né?",
    ])
    expect(pages[0]!.endMs).toBeLessThan(2000)
    expect(spokenEnd(w("conhecessem,", 320, 7480), DEFAULT_PAGING)).toBe(1520)
  })

  it("holds the paging invariants for random input", () => {
    let seed = 11
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const vocab = [
      "a",
      "go",
      "nice",
      "clutch!",
      "what?",
      "absolutely",
      "insane.",
      "ok",
    ]
    for (let run = 0; run < 200; run++) {
      let t = 0
      const words = Array.from({ length: 30 }, () => {
        t += Math.floor(rand() * (rand() > 0.9 ? 1500 : 250))
        const start = t
        t += 80 + Math.floor(rand() * 400)
        return w(vocab[Math.floor(rand() * vocab.length)]!, start, t)
      })
      const options = {
        maxWordsPerPage: 1 + Math.floor(rand() * 5),
        maxCharsPerLine: 10 + Math.floor(rand() * 20),
      }
      const pages = buildCaptionPages(words, t + 1000, options)
      const paged = pages.flatMap((p) => p.words)
      expect(paged.map((x) => [x.text, x.startMs])).toEqual(
        words.map((x) => [x.text, x.startMs])
      )
      paged.forEach((x, i) =>
        expect(x.endMs).toBeLessThanOrEqual(words[i]!.endMs)
      )
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!
        expect(page.words.length).toBeLessThanOrEqual(options.maxWordsPerPage)
        expect(page.lines.reduce((a, b) => a + b, 0)).toBe(page.words.length)
        expect(page.lines.length).toBeLessThanOrEqual(2)
        expect(page.endMs).toBeGreaterThan(page.startMs)
        if (i > 0)
          expect(page.startMs).toBeGreaterThanOrEqual(pages[i - 1]!.endMs)
        for (let j = 1; j < page.words.length; j++) {
          expect(
            page.words[j]!.startMs - page.words[j - 1]!.endMs
          ).toBeLessThanOrEqual(DEFAULT_PAGING.gapMs)
        }
        let at = 0
        for (const count of page.lines) {
          const line = page.words
            .slice(at, at + count)
            .map((x) => x.text)
            .join(" ")
          if (count > 1)
            expect(line.length).toBeLessThanOrEqual(options.maxCharsPerLine)
          at += count
        }
      }
    }
  })
})

describe("wordsInRange and lookup", () => {
  const transcript = sample.map((x) => ({
    ...x,
    startMs: x.startMs + 10_000,
    endMs: x.endMs + 10_000,
    confidence: 1,
  }))

  it("keeps words starting inside the clip, relative to its start", () => {
    const words = wordsInRange(transcript, 10_320, 13_000)
    expect(words[0]).toEqual({ text: "what", startMs: 0, endMs: 280 })
    expect(words.at(-1)!.text).toBe("see")
  })

  it("finds the page and active word at a time", () => {
    const pages = buildCaptionPages(sample, 5000)
    const page = pageAt(pages, 2900)!
    expect(page.index).toBe(1)
    expect(activeWordIndex(page, 2900)).toBe(2)
    expect(pageAt(pages, 2000)).toBeUndefined()
  })

  it("applies edited page text across the page's time", () => {
    const pages = buildCaptionPages(sample, 5000)
    const edited = applyPageOverrides(pages, [
      { index: 0, text: "wait what HAPPENED" },
      { index: 2, text: "  " },
    ])
    expect(edited).toHaveLength(pages.length - 1)
    expect(edited[0]!.words.map((x) => x.text)).toEqual([
      "wait",
      "what",
      "HAPPENED",
    ])
    expect(edited[0]!.words.at(-1)!.endMs).toBe(1300)
  })

  it("builds a clip's pages from its range, style and page overrides", () => {
    const style = { maxWordsPerPage: 2, maxCharsPerLine: 28 }
    const pages = clipCaptionPages(
      transcript,
      {
        startMs: 10_000,
        endMs: 15_000,
        captionOverrides: { pages: [{ index: 0, text: "WAIT" }] },
      },
      style
    )
    expect(pages[0]!.words.map((x) => x.text)).toEqual(["WAIT"])
    expect(pages.slice(1)).toEqual(
      buildCaptionPages(sample, 5000, style).slice(1)
    )
    expect(
      clipCaptionPages(
        transcript,
        { startMs: 10_000, endMs: 15_000, captionOverrides: null },
        style
      )
    ).toEqual(buildCaptionPages(sample, 5000, style))
  })

  it("lets a clip override the project's captions setting", () => {
    const on = { captionsEnabled: true }
    const off = { captionsEnabled: false }
    expect(clipCaptionsEnabled({ captionOverrides: null }, on)).toBe(true)
    expect(clipCaptionsEnabled({ captionOverrides: {} }, off)).toBe(false)
    expect(
      clipCaptionsEnabled({ captionOverrides: { enabled: false } }, on)
    ).toBe(false)
    expect(
      clipCaptionsEnabled({ captionOverrides: { enabled: true } }, off)
    ).toBe(true)
  })
})

describe("styles", () => {
  it("converts OKLCH to sRGB and ASS colors", () => {
    expect(oklchToRgb("oklch(1 0 0)")).toEqual([255, 255, 255])
    expect(oklchToRgb("oklch(0 0 0)")).toEqual([0, 0, 0])
    expect(oklchToRgb("oklch(0.628 0.2577 29.23)")).toEqual([255, 0, 0])
    expect(assColor("background")).toBe("&H00FFFFFF")
    expect(assColor("foreground", 0.5)).toMatch(/^&H80[0-9A-F]{6}$/)
  })

  it("applies valid overrides and ignores invalid ones", () => {
    const style = resolveCaptionStyle({
      presetId: "clean",
      overrides: { fontSize: 100, uppercase: "yes", position: "top", bogus: 1 },
    })
    expect(style).toMatchObject({
      id: "clean",
      fontSize: 100,
      uppercase: false,
      position: "top",
    })
    expect(resolveCaptionStyle({ presetId: "missing" }).id).toBe("punch")
    expect(
      resolveCaptionStyle({ presetId: "punch", overrides: { font: "comic" } })
        .font
    ).toBe("oxanium")
    expect(captionBaseline(style, { mode: "cam-top" })).toBe(0.22)
    expect(
      captionBaseline({ position: "auto" }, { mode: "no-cam-blur-fill" })
    ).toBe(0.8)
  })

  it("defaults new projects to Clean, middle, three words", () => {
    expect(
      resolveCaptionStyle(defaultProjectSettings.captionStyle)
    ).toMatchObject({ id: "clean", position: "middle", maxWordsPerPage: 3 })
  })

  it("places captions at a dragged height, clamped and rounded", () => {
    const ref = { presetId: "punch", overrides: { font: "nunito" } }
    const placed = placeCaption(ref, 0.4321)
    expect(placed.overrides).toEqual({
      font: "nunito",
      position: "custom",
      positionY: 0.43,
    })
    const style = resolveCaptionStyle(placed)
    expect(captionBaseline(style, { mode: "cam-top" })).toBe(0.43)
    expect(
      captionBaseline(style, { mode: "cam-top", camPosition: "bottom" })
    ).toBe(0.43)
    expect(placeCaption(ref, -1).overrides.positionY).toBe(0.1)
    expect(placeCaption(ref, 2).overrides.positionY).toBe(0.95)
    expect(
      resolveCaptionStyle({
        presetId: "punch",
        overrides: { position: "custom", positionY: 3 },
      }).positionY
    ).toBe(0.72)
  })

  it("keeps auto captions on the gameplay when the camera is at the bottom", () => {
    const top = captionBaseline({ position: "auto" }, { mode: "cam-top" })
    const bottom = captionBaseline(
      { position: "auto" },
      { mode: "cam-top", camPosition: "bottom" }
    )
    expect(top).toBe(0.72)
    expect(bottom).toBeGreaterThan(0.3)
    expect(bottom).toBeLessThan(1 - 672 / 1920)
  })
})

describe("ASS", () => {
  it("formats times and escapes override characters", () => {
    expect(assTime(0)).toBe("0:00:00.00")
    expect(assTime(3_723_456)).toBe("1:02:03.46")
    expect(escapeAssText("a{\\b}c\nd")).toBe("a｛＼b｝c d")
  })

  it("matches the golden file", async () => {
    const pages = buildCaptionPages(sample, 5000, {
      maxWordsPerPage: 3,
      maxCharsPerLine: 16,
    })
    const ass = buildAss({
      pages,
      style: resolveCaptionStyle({ presetId: "punch" }),
      baseline: 0.72,
    })
    await expect(ass).toMatchFileSnapshot("./__golden__/punch.ass")
  })

  it("uses the selected font's family name", () => {
    const ass = buildAss({
      pages: [],
      style: resolveCaptionStyle({
        presetId: "punch",
        overrides: { font: "pricedown" },
      }),
      baseline: 0.72,
    })
    expect(ass).toContain("Style: Caption,Pricedown Black,92,")
  })

  it("emits one event per page without highlighting", () => {
    const pages = buildCaptionPages(sample, 5000)
    const ass = buildAss({
      pages,
      style: resolveCaptionStyle({
        presetId: "boxed",
        overrides: { highlight: false },
      }),
      baseline: 0.8,
    })
    const events = ass
      .split("\n")
      .filter((line) => line.startsWith("Dialogue:"))
    expect(events).toHaveLength(pages.length)
    expect(ass).toContain(",3,16,0,2,")
    expect(events[0]).toContain("\\pos(540,1536)")
  })
})

describe("text overlay", () => {
  const punch = resolveCaptionStyle({ presetId: "punch" })
  const overlay = { text: "Wait for it", position: "top" as const, endMs: 3000 }
  const events = (ass: string) =>
    ass.split("\n").filter((line) => line.startsWith("Dialogue:"))

  it("parses with defaults and bounds", () => {
    expect(textOverlaySchema.parse({ text: "  Wait for it " })).toEqual({
      text: "Wait for it",
      position: "top",
      untilMs: 3000,
    })
    expect(
      textOverlaySchema.parse({ text: "Go", position: "center", untilMs: null })
    ).toEqual({ text: "Go", position: "center", untilMs: null })
    const ok = (input: object) =>
      textOverlaySchema.safeParse({ text: "Go", ...input }).success
    expect(ok({ text: "a".repeat(80) })).toBe(true)
    expect(ok({ text: "a".repeat(81) })).toBe(false)
    expect(ok({ text: "   " })).toBe(false)
    expect(ok({ position: "bottom" })).toBe(false)
    expect(ok({ untilMs: 500 })).toBe(true)
    expect(ok({ untilMs: 499 })).toBe(false)
    expect(ok({ untilMs: 180_000 })).toBe(true)
    expect(ok({ untilMs: 180_001 })).toBe(false)
    expect(ok({ untilMs: 1500.5 })).toBe(false)
    expect(
      textOverlaySchema.safeParse({ text: " " }).error?.issues[0]?.message
    ).toBe("Add the on-screen text or turn it off")
  })

  it("defaults to the hook, then the title, cut at a word boundary", () => {
    expect(defaultOverlayText("Wait for it", "Clip")).toBe("Wait for it")
    expect(defaultOverlayText("  ", "Clip")).toBe("Clip")
    expect(defaultOverlayText(" ", "")).toBe("Title")
    const long = defaultOverlayText("word ".repeat(30), "Clip")
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith("word…")).toBe(true)
  })

  it("sizes the title and ends it within the clip", () => {
    expect(overlayFontSize({ fontSize: 92 })).toBe(110)
    expect(overlayFontSize({ fontSize: 160 })).toBe(192)
    expect(overlayEndMs({ untilMs: 3000 }, 20_000)).toBe(3000)
    expect(overlayEndMs({ untilMs: 30_000 }, 20_000)).toBe(20_000)
    expect(overlayEndMs({ untilMs: null }, 20_000)).toBe(20_000)
  })

  it("matches the golden file and leaves captions untouched", async () => {
    const pages = buildCaptionPages(sample, 5000, {
      maxWordsPerPage: 3,
      maxCharsPerLine: 16,
    })
    const ass = buildAss({ pages, style: punch, baseline: 0.72, overlay })
    await expect(ass).toMatchFileSnapshot("./__golden__/overlay.ass")
    expect(ass).toContain(
      "Style: Title,Oxanium ExtraBold,110,&H00FFFFFF,&H00FFFFFF,&H00231415,&H66231415,-1,0,0,0,100,100,0,0,1,8,0,8,90,90,240,1"
    )
    expect(events(ass).at(-1)).toBe(
      "Dialogue: 1,0:00:00.00,0:00:03.00,Title,,0,0,0,,{\\q0}Wait for it"
    )
  })

  it("centers with \\an5", () => {
    const ass = buildAss({
      pages: [],
      style: punch,
      baseline: 0.72,
      overlay: { ...overlay, position: "center" },
    })
    expect(events(ass).at(-1)).toContain("Title,,0,0,0,,{\\an5\\q0}Wait for it")
  })

  it("escapes override codes and keeps emoji", () => {
    const ass = buildAss({
      pages: [],
      style: punch,
      baseline: 0.72,
      overlay: { ...overlay, text: "{\\fs200}big\\Nline\ntwo 🔥" },
    })
    expect(events(ass).at(-1)).toContain("{\\q0}｛＼fs200｝big＼Nline two 🔥")
  })

  it("emits only the title event without caption pages", () => {
    const ass = buildAss({ pages: [], style: punch, baseline: 0.72, overlay })
    expect(events(ass)).toHaveLength(1)
    expect(ass).not.toContain(",Caption,,")
  })
})

describe("sampleCaptionWords", () => {
  const word = (text: string, startMs: number) => ({
    text,
    startMs,
    endMs: startMs + 200,
    confidence: 1,
  })

  it("picks a continuous run and times it from zero", () => {
    const words = [
      word("a", 0),
      word("b", 5000),
      word("c", 5300),
      word("d", 5600),
      word("e", 9000),
    ]
    expect(sampleCaptionWords(words, 3)).toEqual([
      { text: "b", startMs: 0, endMs: 200 },
      { text: "c", startMs: 300, endMs: 500 },
      { text: "d", startMs: 600, endMs: 800 },
    ])
  })

  it("returns nothing when no run is long enough", () => {
    expect(sampleCaptionWords([word("a", 0), word("b", 5000)], 2)).toEqual([])
  })
})
