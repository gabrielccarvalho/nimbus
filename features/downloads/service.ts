import "server-only"

import { newId, withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { projectRepository } from "../projects/repository"
import { parseImportOptions, projectSettingsFromApp } from "../projects/upload"
import { parseVideoUrl, placeholderName } from "./url"

export async function importFromUrl(
  db: Db,
  input: unknown,
  options: unknown = {}
) {
  const url = parseVideoUrl(input)
  const projectId = newId()
  const settings = await projectSettingsFromApp(parseImportOptions(options))
  await withTransaction(db, async (tx) => {
    await projectRepository(tx).create({
      id: projectId,
      name: placeholderName(url).slice(0, 120),
      settings,
      sourceUrl: url,
    })
    await jobQueue(tx).enqueue({ type: "download", projectId })
  })
  return { projectId }
}
