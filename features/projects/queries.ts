import "server-only"

import { connection } from "next/server"

import { getDb, type Db } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { mediaUrl, slugify } from "@/lib/format"

import { normalizeLoudness } from "../analysis/loudness"
import { signalsRepository } from "../analysis/repository"
import { sampleCaptionWords } from "../captions/pages"
import { speakerTranscriptWords } from "../captions/speaker"
import { clipRepository } from "../clips/repository"
import { NICHE_PROFILES, resolveNiche } from "../highlights/niches"
import { buildManualPrompt } from "../highlights/prompt"
import { jobQueue } from "../jobs/queue"
import { layoutRepository } from "../layout/repository"
import { getProjectSnapshot } from "../pipeline/snapshot"
import { isEnglishOnlyModel } from "../transcription/language"
import { transcriptRepository } from "../transcription/repository"
import { assetRepository, projectRepository, type Project } from "./repository"

async function audioSummary(db: Db, project: Project) {
  const signals = await signalsRepository(db).get(project.id)
  if (!signals) return undefined
  return {
    audience: project.audienceHeatmap ?? [],
    loudness: normalizeLoudness(signals.loudness),
    silences: signals.silences,
    silentMs: signals.silences.reduce((sum, s) => sum + s.endMs - s.startMs, 0),
  }
}

export type AudioSummary = NonNullable<Awaited<ReturnType<typeof audioSummary>>>

export async function listProjects() {
  await connection()
  return projectRepository(getDb()).list()
}

export async function listRecentProjects(limit = 5) {
  await connection()
  return (await projectRepository(getDb()).list({ limit })).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
  }))
}

export async function getProject(id: string) {
  await connection()
  return projectRepository(getDb()).get(id)
}

export async function getProjectOverview(id: string) {
  await connection()
  const db = getDb()
  const project = await projectRepository(db).get(id)
  if (!project) return undefined
  const [assets, layout, audio, clips, jobs, snapshot] = await Promise.all([
    assetRepository(db).listForProject(id),
    layoutRepository(db).get(id),
    audioSummary(db, project),
    clipRepository(db).listForProject(id),
    jobQueue(db).listForProject(id),
    getProjectSnapshot(db, id),
  ])
  return {
    project,
    source: assets.find((a) => a.kind === "source"),
    thumbnail: assets.find((a) => a.kind === "thumbnail"),
    proxy: assets.find((a) => a.kind === "proxy"),
    layout,
    audio,
    clips,
    jobs,
    snapshot: snapshot!,
  }
}

export type ProjectOverview = NonNullable<
  Awaited<ReturnType<typeof getProjectOverview>>
>

export async function getProjectTranscript(id: string) {
  await connection()
  const db = getDb()
  const project = await projectRepository(db).get(id)
  if (!project) return undefined
  const [assets, transcript, audio] = await Promise.all([
    assetRepository(db).listForProject(id),
    transcriptRepository(db).get(id),
    audioSummary(db, project),
  ])
  return {
    project,
    proxy: assets.find((a) => a.kind === "proxy"),
    source: assets.find((a) => a.kind === "source"),
    transcript,
    audio,
  }
}

export async function getProjectClips(id: string) {
  await connection()
  const db = getDb()
  const project = await projectRepository(db).get(id)
  if (!project) return undefined
  const [assets, clips, audio, layout, snapshot] = await Promise.all([
    assetRepository(db).listForProject(id),
    clipRepository(db).listForProject(id),
    audioSummary(db, project),
    layoutRepository(db).get(id),
    getProjectSnapshot(db, id),
  ])
  const source = assets.find((a) => a.kind === "source")
  const durationMs = source?.durationMs ?? 0
  let manualPrompt: string | undefined
  if (project.awaitingManualSelection) {
    const transcript = await transcriptRepository(db).get(id)
    const signals = await signalsRepository(db).get(id)
    manualPrompt = buildManualPrompt({
      durationMs,
      words: transcript?.words ?? [],
      language: transcript?.language ?? project.settings.language,
      audience: project.audienceHeatmap ?? [],
      niche: NICHE_PROFILES[resolveNiche(project.settings.niche, project.name)],
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
    audio,
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
    layoutConfirmed: Boolean(layout?.confirmedByUser),
    snapshot: snapshot!,
  }
}

export async function getClipEditor(projectId: string, clipId: string) {
  await connection()
  const db = getDb()
  const [project, clip] = await Promise.all([
    projectRepository(db).get(projectId),
    clipRepository(db).get(clipId),
  ])
  if (!project || !clip || clip.projectId !== project.id) return undefined
  const [assets, layout, transcript, snapshot] = await Promise.all([
    assetRepository(db).listForProject(projectId),
    layoutRepository(db).get(projectId),
    transcriptRepository(db).get(projectId),
    getProjectSnapshot(db, projectId),
  ])
  const source = assets.find((a) => a.kind === "source")
  const video = assets.find((a) => a.kind === "proxy") ?? source
  const render = clip.renderAssetId
    ? assets.find((a) => a.id === clip.renderAssetId)
    : undefined
  return {
    project,
    clip,
    source,
    video,
    layout,
    words: speakerTranscriptWords(transcript),
    render: render
      ? {
          url: mediaUrl(render.storageKey),
          downloadUrl: mediaUrl(render.storageKey, {
            download: `${slugify(clip.title)}.mp4`,
          }),
        }
      : undefined,
    snapshot: snapshot!,
  }
}

export async function getProjectLayout(id: string) {
  await connection()
  const db = getDb()
  const project = await projectRepository(db).get(id)
  if (!project) return undefined
  const [assets, layout, transcript] = await Promise.all([
    assetRepository(db).listForProject(id),
    layoutRepository(db).get(id),
    transcriptRepository(db).get(id),
  ])
  const source = assets.find((a) => a.kind === "source")
  const proxy = assets.find((a) => a.kind === "proxy")
  const preset =
    source?.width && source.height
      ? await layoutRepository(db).findPreset(source.width, source.height)
      : undefined
  return {
    project,
    source,
    video: proxy ?? source,
    layout,
    hasPreset: Boolean(preset),
    captionSample: sampleCaptionWords(speakerTranscriptWords(transcript)),
  }
}

export async function getProjectSettings(id: string) {
  await connection()
  const db = getDb()
  const project = await projectRepository(db).get(id)
  if (!project) return undefined
  const [source, transcript] = await Promise.all([
    assetRepository(db).findByKind(id, "source"),
    transcriptRepository(db).get(id),
  ])
  const env = getEnv()
  return {
    project,
    audioTracks: source?.audioTracks ?? [],
    transcript: transcript
      ? { language: transcript.language, source: transcript.languageSource }
      : null,
    claudeAvailable: Boolean(env.ANTHROPIC_API_KEY),
    englishOnlyModel:
      env.TRANSCRIBER === "whisper" && isEnglishOnlyModel(env.WHISPER_MODEL),
  }
}

export type ProjectSettingsData = NonNullable<
  Awaited<ReturnType<typeof getProjectSettings>>
>
