import "server-only"

import { newId, withTransaction, type Db } from "@/lib/db"

import { jobQueue } from "../jobs/queue"
import { projectRepository } from "../projects/repository"
import { projectSettingsFromApp } from "../projects/upload"
import { parseVideoUrl, placeholderName } from "./url"

export function importFromUrl(db: Db, input: unknown) {
  const url = parseVideoUrl(input)
  const projectId = newId()
  withTransaction(db, () => {
    projectRepository(db).create({
      id: projectId,
      name: placeholderName(url).slice(0, 120),
      settings: projectSettingsFromApp(),
      sourceUrl: url,
    })
    jobQueue(db).enqueue({ type: "download", projectId })
  })
  return { projectId }
}
