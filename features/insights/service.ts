import "server-only"

import type { Db } from "@/lib/db"

import { NICHE_PROFILES, resolveNiche } from "../highlights/niches"
import { transcriptLines } from "../highlights/prompt"
import { projectRepository } from "../projects/repository"
import { relativePerformance, retentionMoments } from "../publishing/stats"
import { statsRepository } from "../publishing/stats-repository"
import { transcriptRepository } from "../transcription/repository"
import type { InsightClip } from "./prompt"
import { INSIGHTS_MIN_AGE_DAYS } from "./schema"

const DAY_MS = 86_400_000

type Transcript = NonNullable<
  Awaited<ReturnType<ReturnType<typeof transcriptRepository>["get"]>>
>
type ProjectContext = Pick<Transcript, "language" | "words" | "segments"> & {
  niche: string
}

export async function eligibleInsightClips(
  db: Db,
  channelId: string
): Promise<InsightClip[]> {
  const stats = statsRepository(db)
  const rows = await stats.forChannel(channelId)
  const eligible = []
  for (const row of rows) {
    const { publication } = row
    if (!publication.publishedAt) continue
    const snapshot = (await stats.history(publication.id)).at(-1)
    if (
      !snapshot ||
      snapshot.fetchedAt.getTime() - publication.publishedAt.getTime() <
        INSIGHTS_MIN_AGE_DAYS * DAY_MS
    ) {
      continue
    }
    eligible.push({
      ...row,
      snapshot,
      ageDays:
        (snapshot.fetchedAt.getTime() - publication.publishedAt.getTime()) /
        DAY_MS,
    })
  }

  const samples = eligible.map((e) => ({
    publicationId: e.publication.id,
    ageDays: e.ageDays,
    views: e.snapshot.views,
  }))
  const projects = projectRepository(db)
  const projectContext = new Map<string, Promise<ProjectContext>>()
  const contextFor = (projectId: string) => {
    let context = projectContext.get(projectId)
    if (!context) {
      context = (async () => {
        const project = await projects.get(projectId)
        const transcript = await transcriptRepository(db).get(projectId)
        const settings = project?.settings
        return {
          niche:
            NICHE_PROFILES[resolveNiche(settings?.niche, project?.name ?? "")]
              .label,
          language: transcript?.language ?? settings?.language ?? "en",
          words: transcript?.words ?? [],
          segments: transcript?.segments ?? [],
        }
      })()
      projectContext.set(projectId, context)
    }
    return context
  }

  return Promise.all(
    eligible.map(async (e, index) => {
      const { clip, publication, snapshot } = e
      const context = await contextFor(e.projectId)
      const range = {
        startMs: publication.clipStartMs ?? clip.startMs,
        endMs: publication.clipEndMs ?? clip.endMs,
      }
      const effects = clip.effects?.events ?? []
      const beats = clip.beats ?? []
      return {
        clipId: clip.id,
        title: clip.title,
        hook: clip.hook,
        reason: clip.reason,
        score: clip.score,
        niche: context.niche,
        transcript: transcriptLines(
          {
            words: context.words,
            segments: context.segments,
            language: context.language,
          },
          range.startMs,
          range.endMs
        ),
        effects: [...new Set(effects.map((effect) => effect.kind))],
        beats: [...new Set(beats.map((beat) => beat.kind))],
        moments: retentionMoments(snapshot.retention ?? [], range, {
          words: context.words,
          beats,
          effects,
        }),
        views: snapshot.views,
        averageViewPercentage: snapshot.averageViewPercentage,
        relative: relativePerformance(samples[index]!, samples),
        ruleIds: clip.playbookRuleIds ?? [],
      }
    })
  )
}
