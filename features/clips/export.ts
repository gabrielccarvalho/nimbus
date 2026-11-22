import "server-only"

import type { Db } from "@/lib/db"
import { slugify } from "@/lib/format"

import { assetRepository } from "../projects/repository"
import { clipRepository } from "./repository"

export type ExportEntry = { name: string; storageKey: string }

export function exportContents(db: Db, projectId: string) {
  const assets = assetRepository(db)
  const files: ExportEntry[] = []
  const manifest: Array<Record<string, unknown>> = []
  const rendered = clipRepository(db)
    .listForProject(projectId)
    .filter((clip) => clip.renderAssetId)
  rendered.forEach((clip, index) => {
    const asset = assets.get(clip.renderAssetId!)
    if (!asset) return
    const name = `${String(index + 1).padStart(2, "0")}-${slugify(clip.title)}.mp4`
    files.push({ name, storageKey: asset.storageKey })
    manifest.push({
      file: name,
      title: clip.title,
      hook: clip.hook,
      startMs: clip.startMs,
      endMs: clip.endMs,
      editedSinceRender: clip.status !== "rendered",
    })
  })
  const edit = assets.findByKind(projectId, "edit")
  if (edit) {
    files.push({ name: "edit-horizontal.mp4", storageKey: edit.storageKey })
    manifest.push({ file: "edit-horizontal.mp4", durationMs: edit.durationMs })
  }
  return { files, manifest }
}
