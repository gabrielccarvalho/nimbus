import "server-only"

import type { Db } from "@/lib/db"

import { isLandscape } from "../pipeline/steps/probe-parse"
import { assetRepository } from "../projects/repository"
import { settingsRepository } from "../settings/repository"
import { startingLayout } from "./schema"

export async function clipStartLayout(
  db: Db,
  project: { id: string; workspaceId: string | null }
) {
  const [settings, source] = await Promise.all([
    settingsRepository(db, project.workspaceId).get(),
    assetRepository(db).findByKind(project.id, "source"),
  ])
  return startingLayout(
    { mode: settings.layoutMode, camPosition: settings.camPosition },
    {
      landscape:
        !source?.width ||
        !source.height ||
        isLandscape(source.width, source.height),
    }
  )
}
