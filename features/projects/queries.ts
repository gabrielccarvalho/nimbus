import "server-only"

import { connection } from "next/server"

import { getDb, type Db } from "@/lib/db"
import { mediaUrl, slugify } from "@/lib/format"

import { normalizeLoudness } from "../analysis/loudness"
import { signalsRepository } from "../analysis/repository"
import { clipRepository } from "../clips/repository"
import { buildManualPrompt } from "../highlights/prompt"
import { jobQueue } from "../jobs/queue"
import { layoutRepository } from "../layout/repository"
import { getProjectSnapshot } from "../pipeline/snapshot"
import { transcriptRepository } from "../transcription/repository"
import { assetRepository, projectRepository } from "./repository"

function audioSummary(db: Db, projectId: string) {
  const signals = signalsRepository(db).get(projectId)
  if (!signals) return undefined
  return {
    loudness: normalizeLoudness(signals.loudness),
    silences: signals.silences,
    silentMs: signals.silences.reduce((sum, s) => sum + s.endMs - s.startMs, 0),
  }
}

export type AudioSummary = NonNullable<ReturnType<typeof audioSummary>>

export async function listProjects() {
  await connection()
  return projectRepository(getDb()).list()
}

export async function listRecentProjects(limit = 5) {
  await connection()
  return projectRepository(getDb())
    .list({ limit })
    .map((p) => ({ id: p.id, name: p.name, status: p.status }))
}

export async function getProject(id: string) {
  await connection()
  return projectRepository(getDb()).get(id)
}

export async function getProjectOverview(id: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(id)
  if (!project) return undefined
  const assets = assetRepository(db).listForProject(id)
  return {
    project,
    source: assets.find((a) => a.kind === "source"),
    thumbnail: assets.find((a) => a.kind === "thumbnail"),
    proxy: assets.find((a) => a.kind === "proxy"),
    layout: layoutRepository(db).get(id),
    audio: audioSummary(db, id),
    clips: clipRepository(db).listForProject(id),
    jobs: jobQueue(db).listForProject(id),
    snapshot: getProjectSnapshot(db, id)!,
  }
}

export type ProjectOverview = NonNullable<
  Awaited<ReturnType<typeof getProjectOverview>>
>

export async function getProjectTranscript(id: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(id)
  if (!project) return undefined
  const assets = assetRepository(db).listForProject(id)
  return {
    project,
    proxy: assets.find((a) => a.kind === "proxy"),
    source: assets.find((a) => a.kind === "source"),
    transcript: transcriptRepository(db).get(id),
    audio: audioSummary(db, id),
  }
}

export async function getProjectClips(id: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(id)
  if (!project) return undefined
  const assets = assetRepository(db).listForProject(id)
  const source = assets.find((a) => a.kind === "source")
  const durationMs = source?.durationMs ?? 0
  const clips = clipRepository(db).listForProject(id)
  let manualPrompt: string | undefined
  if (project.awaitingManualSelection) {
    const transcript = transcriptRepository(db).get(id)
    const signals = signalsRepository(db).get(id)
    manualPrompt = buildManualPrompt({
      durationMs,
      segments: transcript?.segments ?? [],
      signals: signals ?? {
        silences: [],
        loudness: [],
        loudnessIntervalMs: 250,
        speechDensity: [],
      },
      limits: {
        minMs: project.settings.clipMinMs,
        maxMs: project.settings.clipMaxMs,
        maxCount: project.settings.targetClipCount,
      },
    })
  }
  const renders = Object.fromEntries(
    clips.flatMap((clip) => {
      const asset = clip.renderAssetId
        ? assets.find((a) => a.id === clip.renderAssetId)
        : undefined
      return asset
        ? [
            [
              clip.id,
              {
                url: mediaUrl(asset.storageKey),
                downloadUrl: mediaUrl(asset.storageKey, {
                  download: `${slugify(clip.title)}.mp4`,
                }),
              },
            ],
          ]
        : []
    })
  )
  const edit = assets.find((a) => a.kind === "edit")
  return {
    project,
    clips,
    durationMs,
    video: assets.find((a) => a.kind === "proxy") ?? source,
    audio: audioSummary(db, id),
    manualPrompt,
    renders,
    edit: edit
      ? {
          url: mediaUrl(edit.storageKey),
          downloadUrl: mediaUrl(edit.storageKey, {
            download: `${slugify(project.name, "project")}-edit.mp4`,
          }),
          durationMs: edit.durationMs ?? 0,
        }
      : undefined,
    layoutConfirmed: Boolean(layoutRepository(db).get(id)?.confirmedByUser),
    snapshot: getProjectSnapshot(db, id)!,
  }
}

export async function getClipEditor(projectId: string, clipId: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(projectId)
  const clip = clipRepository(db).get(clipId)
  if (!project || !clip || clip.projectId !== project.id) return undefined
  const assets = assetRepository(db).listForProject(projectId)
  const source = assets.find((a) => a.kind === "source")
  const video = assets.find((a) => a.kind === "proxy") ?? source
  const layout = layoutRepository(db).get(projectId)
  const render = clip.renderAssetId
    ? assets.find((a) => a.id === clip.renderAssetId)
    : undefined
  return {
    project,
    clip,
    source,
    video,
    layout,
    words: transcriptRepository(db).get(projectId)?.words ?? [],
    render: render
      ? {
          url: mediaUrl(render.storageKey),
          downloadUrl: mediaUrl(render.storageKey, {
            download: `${slugify(clip.title)}.mp4`,
          }),
        }
      : undefined,
    snapshot: getProjectSnapshot(db, projectId)!,
  }
}

export async function getProjectLayout(id: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(id)
  if (!project) return undefined
  const assets = assetRepository(db).listForProject(id)
  const source = assets.find((a) => a.kind === "source")
  const proxy = assets.find((a) => a.kind === "proxy")
  const layout = layoutRepository(db).get(id)
  const preset =
    source?.width && source.height
      ? layoutRepository(db).findPreset(source.width, source.height)
      : undefined
  return {
    project,
    source,
    video: proxy ?? source,
    layout,
    hasPreset: Boolean(preset),
  }
}
