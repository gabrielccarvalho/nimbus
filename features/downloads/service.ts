import "server-only"

import { newId, withTransaction, type Db } from "@/lib/db"
import type { Logger } from "@/lib/logger"

import { jobQueue } from "../jobs/queue"
import { projectRepository } from "../projects/repository"
import { parseImportOptions, projectSettingsFromApp } from "../projects/upload"
import type { AudiencePoint } from "../analysis/schema"
import { getDownloader } from "./index"
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

export async function loadAudienceHeatmap(
  db: Db,
  project: {
    id: string
    sourceUrl: string | null
    audienceHeatmap: AudiencePoint[] | null
  },
  { signal, logger }: { signal?: AbortSignal; logger: Logger }
): Promise<AudiencePoint[]> {
  if (project.audienceHeatmap || !project.sourceUrl) {
    return project.audienceHeatmap ?? []
  }
  try {
    const { heatmap } = await getDownloader().info(project.sourceUrl, signal)
    await projectRepository(db).setAudienceHeatmap(project.id, heatmap)
    return heatmap
  } catch (error) {
    if (signal?.aborted) throw error
    logger.warn({ err: error }, "couldn't fetch the video's replay heatmap")
    return []
  }
}
