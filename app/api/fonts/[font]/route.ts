import { readFile } from "node:fs/promises"

import { captionStyleOverridesSchema } from "@/features/captions/styles"
import { captionFontPath } from "@/features/render/fonts"
import { AppError } from "@/lib/errors"
import { errorResponse } from "@/lib/http/responses"

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/fonts/[font]">
) {
  try {
    const font = captionStyleOverridesSchema.shape.font.safeParse(
      (await ctx.params).font
    )
    if (!font.success) throw new AppError("NOT_FOUND", "Font not found")
    const file = captionFontPath(font.data)
    const data = await readFile(file).catch(() => {
      throw new AppError("NOT_FOUND", "Font not installed")
    })
    return new Response(data, {
      headers: {
        "Content-Type": file.endsWith(".otf") ? "font/otf" : "font/ttf",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return errorResponse(error, { route: "fonts" })
  }
}
