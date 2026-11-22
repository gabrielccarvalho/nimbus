import type { CaptionPage } from "./pages"
import { assColor, type CaptionStyle } from "./styles"

const WIDTH = 1080
const HEIGHT = 1920

export function assTime(ms: number) {
  const cs = Math.max(0, Math.round(ms / 10))
  const h = Math.floor(cs / 360_000)
  const m = Math.floor((cs % 360_000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${h}:${pad(m)}:${pad(s)}.${pad(c)}`
}

export function escapeAssText(text: string) {
  return text
    .replace(/\\/g, "＼")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .replace(/\r?\n/g, " ")
}

function pageText(
  page: CaptionPage,
  style: CaptionStyle,
  active: number
): string {
  const highlight = `{\\c${assColor(style.highlightColor)}}`
  const reset = `{\\c${assColor(style.text)}}`
  const lines: string[] = []
  let index = 0
  for (const count of page.lines) {
    const words: string[] = []
    for (let i = 0; i < count; i++, index++) {
      const raw = page.words[index]!.text
      const text = escapeAssText(style.uppercase ? raw.toUpperCase() : raw)
      words.push(
        style.highlight && index === active
          ? `${highlight}${text}${reset}`
          : text
      )
    }
    lines.push(words.join(" "))
  }
  return lines.join("\\N")
}

export function buildAss({
  pages,
  style,
  baseline,
}: {
  pages: readonly CaptionPage[]
  style: CaptionStyle
  baseline: number
}) {
  const borderStyle = style.box ? 3 : 1
  const outlineColor = style.box
    ? assColor(style.outlineColor, 0.75)
    : assColor(style.outlineColor)
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${style.fontFamily},${style.fontSize},${assColor(style.text)},${assColor(style.highlightColor)},${outlineColor},${assColor(style.outlineColor, 0.6)},0,0,0,0,100,100,0,0,${borderStyle},${style.outline},${style.shadow},2,60,60,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ]
  const position = `{\\an2\\pos(${WIDTH / 2},${Math.round(baseline * HEIGHT)})}`
  const events: string[] = []
  for (const page of pages) {
    const cuts = [page.startMs]
    if (style.highlight) {
      for (const word of page.words) {
        if (word.startMs > cuts.at(-1)! && word.startMs < page.endMs)
          cuts.push(word.startMs)
      }
    }
    cuts.push(page.endMs)
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i]!
      const end = cuts[i + 1]!
      if (assTime(end) === assTime(start)) continue
      let active = -1
      page.words.forEach((word, w) => {
        if (word.startMs <= start) active = w
      })
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${position}${pageText(page, style, active)}`
      )
    }
  }
  return `${[...header, ...events].join("\n")}\n`
}
