import { existsSync } from "node:fs"
import path from "node:path"

import {
  CAPTION_FONT_IDS,
  CAPTION_FONTS,
  type CaptionFontId,
} from "../captions/styles"

export const CAPTION_FONTS_DIR = path.resolve(process.cwd(), "assets/fonts")

export const captionFontPath = (id: CaptionFontId) =>
  path.join(CAPTION_FONTS_DIR, CAPTION_FONTS[id].file)

export const installedCaptionFonts = (): CaptionFontId[] =>
  CAPTION_FONT_IDS.filter((id) => existsSync(captionFontPath(id)))
