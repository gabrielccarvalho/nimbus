import { z } from "zod"

import { OUTPUT_HEIGHT, SPLIT_HEIGHTS } from "../layout/geometry"

export const CAPTION_TOKENS = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  primary: "oklch(0.841 0.238 128.85)",
} as const

export type CaptionColorToken = keyof typeof CAPTION_TOKENS

export function oklchToRgb(value: string): [number, number, number] {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (!match) throw new Error(`Unsupported color: ${value}`)
  const [L, C, H] = match.slice(1).map(Number) as [number, number, number]
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return linear.map((channel) => {
    const c = Math.min(1, Math.max(0, channel))
    const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(encoded * 255)
  }) as [number, number, number]
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0")

export function assColor(token: CaptionColorToken, opacity = 1) {
  const [r, g, b] = oklchToRgb(CAPTION_TOKENS[token])
  return `&H${hex(Math.round((1 - opacity) * 255))}${hex(b)}${hex(g)}${hex(r)}`
}

export function cssColor(token: CaptionColorToken, opacity = 1) {
  const [r, g, b] = oklchToRgb(CAPTION_TOKENS[token])
  return `rgb(${r} ${g} ${b} / ${opacity})`
}

export const CAPTION_FONT_IDS = ["oxanium", "nunito", "pricedown"] as const
export type CaptionFontId = (typeof CAPTION_FONT_IDS)[number]

export const CAPTION_FONTS: Record<
  CaptionFontId,
  { label: string; fontFamily: string; cssFontFamily: string; file: string }
> = {
  oxanium: {
    label: "Oxanium",
    fontFamily: "Oxanium ExtraBold",
    cssFontFamily: "var(--font-heading)",
    file: "Oxanium-ExtraBold.ttf",
  },
  nunito: {
    label: "Nunito Sans",
    fontFamily: "Nunito Sans ExtraBold",
    cssFontFamily: "var(--font-sans)",
    file: "NunitoSans-ExtraBold.ttf",
  },
  pricedown: {
    label: "Pricedown",
    fontFamily: "Pricedown Black",
    cssFontFamily: '"Pricedown Black", var(--font-heading)',
    file: "Pricedown-Black.otf",
  },
}

export const captionStyleOverridesSchema = z.object({
  font: z.enum(CAPTION_FONT_IDS),
  fontSize: z.number().int().min(36).max(160),
  uppercase: z.boolean(),
  maxWordsPerPage: z.number().int().min(1).max(8),
  maxCharsPerLine: z.number().int().min(8).max(40),
  position: z.enum(["auto", "top", "middle", "bottom"]),
  highlight: z.boolean(),
})
export type CaptionStyleOverrides = z.infer<typeof captionStyleOverridesSchema>

export type CaptionStyle = CaptionStyleOverrides & {
  id: string
  label: string
  text: CaptionColorToken
  highlightColor: CaptionColorToken
  outlineColor: CaptionColorToken
  outline: number
  shadow: number
  box: boolean
}

export const CAPTION_PRESETS: readonly CaptionStyle[] = [
  {
    id: "punch",
    label: "Punch",
    font: "oxanium",
    fontSize: 92,
    uppercase: true,
    maxWordsPerPage: 3,
    maxCharsPerLine: 16,
    position: "auto",
    highlight: true,
    text: "background",
    highlightColor: "primary",
    outlineColor: "foreground",
    outline: 7,
    shadow: 0,
    box: false,
  },
  {
    id: "clean",
    label: "Clean",
    font: "nunito",
    fontSize: 72,
    uppercase: false,
    maxWordsPerPage: 4,
    maxCharsPerLine: 28,
    position: "auto",
    highlight: true,
    text: "background",
    highlightColor: "primary",
    outlineColor: "foreground",
    outline: 5,
    shadow: 2,
    box: false,
  },
  {
    id: "boxed",
    label: "Boxed",
    font: "nunito",
    fontSize: 68,
    uppercase: false,
    maxWordsPerPage: 4,
    maxCharsPerLine: 24,
    position: "auto",
    highlight: true,
    text: "background",
    highlightColor: "primary",
    outlineColor: "foreground",
    outline: 16,
    shadow: 0,
    box: true,
  },
]

export function resolveCaptionStyle(ref: {
  presetId: string
  overrides?: Record<string, unknown>
}): CaptionStyle {
  const preset =
    CAPTION_PRESETS.find((p) => p.id === ref.presetId) ?? CAPTION_PRESETS[0]!
  const valid: Partial<CaptionStyleOverrides> = {}
  for (const [key, value] of Object.entries(ref.overrides ?? {})) {
    const field =
      captionStyleOverridesSchema.shape[key as keyof CaptionStyleOverrides]
    if (field?.safeParse(value).success) Object.assign(valid, { [key]: value })
  }
  return { ...preset, ...valid }
}

export const BASELINE = {
  "cam-top": 0.72,
  "split-50": 0.72,
  "no-cam-blur-fill": 0.8,
  "no-cam-fill": 0.72,
} as const

export function captionBaseline(
  style: Pick<CaptionStyle, "position">,
  layout: { mode: keyof typeof BASELINE; camPosition?: "top" | "bottom" }
) {
  if (style.position === "top") return 0.22
  if (style.position === "middle") return 0.55
  if (style.position === "bottom") return 0.86
  if (
    layout.camPosition === "bottom" &&
    (layout.mode === "cam-top" || layout.mode === "split-50")
  ) {
    const [cam] = SPLIT_HEIGHTS[layout.mode]
    const camShare = cam / OUTPUT_HEIGHT
    const within = (BASELINE[layout.mode] - camShare) / (1 - camShare)
    return within * (1 - camShare)
  }
  return BASELINE[layout.mode]
}

export function cssCaptionStyle(style: CaptionStyle) {
  return {
    fontFamily: CAPTION_FONTS[style.font].cssFontFamily,
    fontSize: style.fontSize,
    uppercase: style.uppercase,
    color: cssColor(style.text),
    highlightColor: cssColor(style.highlightColor),
    outlineColor: cssColor(style.outlineColor, style.box ? 0.75 : 1),
    outline: style.outline,
    box: style.box,
    highlight: style.highlight,
  }
}
