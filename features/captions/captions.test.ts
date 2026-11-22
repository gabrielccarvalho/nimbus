import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { assTime, buildAss, escapeAssText } from "./ass"
import {
  activeWordIndex,
  applyPageOverrides,
  breakLines,
  buildCaptionPages,
  pageAt,
  wordsInRange,
  type CaptionWord,
} from "./pages"
import {
  assColor,
  CAPTION_TOKENS,
  captionBaseline,
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
    expect(pages[0]!.endMs).toBe(1700)
    expect(pages[1]!.startMs).toBe(2400)
    expect(pages[1]!.endMs).toBe(pages[2]!.startMs)
    expect(pages.at(-1)!.endMs).toBe(4600)
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
      expect(pages.flatMap((p) => p.words)).toEqual(words)
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
          ).toBeLessThanOrEqual(600)
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
})

describe("styles", () => {
  it("matches the design tokens in globals.css", () => {
    const css = readFileSync(path.resolve("app/globals.css"), "utf8")
    const root = css.slice(
      css.indexOf(":root"),
      css.indexOf("}", css.indexOf(":root"))
    )
    for (const [token, value] of Object.entries(CAPTION_TOKENS)) {
      expect(root).toContain(`--${token}: ${value};`)
    }
  })

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
    expect(captionBaseline(style, "cam-top")).toBe(0.22)
    expect(captionBaseline({ position: "auto" }, "no-cam-blur-fill")).toBe(0.8)
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
