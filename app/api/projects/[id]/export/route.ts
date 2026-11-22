import { Readable } from "node:stream"

import yazl from "yazl"

import { exportContents } from "@/features/clips/export"
import { projectRepository } from "@/features/projects/repository"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { slugify } from "@/lib/format"
import { errorResponse, toWebStream } from "@/lib/http/responses"
import { getStorage } from "@/lib/storage"

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[id]/export">
) {
  try {
    const { id } = await ctx.params
    const db = getDb()
    const project = projectRepository(db).getOrThrow(id)
    const storage = getStorage()
    const contents = exportContents(db, id)
    const present = await Promise.all(
      contents.files.map(async (file) =>
        Boolean(await storage.stat(file.storageKey))
      )
    )
    const files = contents.files.filter((_, i) => present[i])
    const manifest = contents.manifest.filter((entry) =>
      files.some((file) => file.name === entry.file)
    )
    if (files.length === 0) {
      throw new AppError("NOT_FOUND", "Nothing has been rendered yet")
    }
    const zip = new yazl.ZipFile()
    for (const file of files) {
      zip.addFile(storage.resolve(file.storageKey), file.name, {
        compress: false,
      })
    }
    zip.addBuffer(
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      "clips.json"
    )
    zip.end()
    const name = `${slugify(project.name, "project")}-clips.zip`
    return new Response(toWebStream(zip.outputStream as Readable), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return errorResponse(error, { route: "export" })
  }
}
