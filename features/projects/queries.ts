import "server-only"

import { connection } from "next/server"

import { getDb, type Db } from "@/lib/db"

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
  return {
    project,
    clips,
    durationMs,
    video: assets.find((a) => a.kind === "proxy") ?? source,
    audio: audioSummary(db, id),
    manualPrompt,
  }
}
