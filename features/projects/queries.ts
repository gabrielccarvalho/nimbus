import "server-only"

import { connection } from "next/server"

import { getDb, type Db } from "@/lib/db"
import { mediaUrl, slugify } from "@/lib/format"

import { getSession, requireViewer } from "../accounts/session"
import { claudeAvailable, transcriptionAvailable } from "../accounts/usage"
import { normalizeLoudness } from "../analysis/loudness"
import { signalsRepository } from "../analysis/repository"
import { clipCaptionLanes, clipCaptionsEnabled } from "../captions/pages"
import { speakerTranscriptWords } from "../captions/speaker"
import { resolveCaptionStyle } from "../captions/styles"
import { clipParts, timelineItems, type Parted } from "../clips/parts"
import { clipRepository } from "../clips/repository"
import { NICHE_PROFILES, resolveNiche } from "../highlights/niches"
import { loadPlaybook } from "../insights/repository"
import { buildManualPrompt } from "../highlights/prompt"
import { jobQueue } from "../jobs/queue"
import { classifyAspect } from "../pipeline/steps/probe-parse"
import { musicTracksFor } from "../music/queries"
import { getProjectSnapshot } from "../pipeline/snapshot"
import { transcriptRepository } from "../transcription/repository"
import { assetRepository, projectRepository, type Project } from "./repository"

async function visibleProject(db: Db, id: string) {
  const [viewer, project] = await Promise.all([
    getSession(),
    projectRepository(db).get(id),
  ])
  if (!viewer || !project || project.workspaceId !== viewer.workspace.id) {
    return undefined
  }
  return project
}

async function viewerWorkspaceId() {
  return (await requireViewer()).workspace.id
}

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
  return projectRepository(getDb()).list({
    workspaceId: await viewerWorkspaceId(),
  })
}

export async function listRecentProjects(limit = 5) {
  await connection()
  const workspaceId = await viewerWorkspaceId()
  return (await projectRepository(getDb()).list({ limit, workspaceId })).map(
    (p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      failedStep: p.failedStep,
      awaitingManualSelection: p.awaitingManualSelection,
      reviewCount: p.reviewCount,
    })
  )
}

export async function countProjects() {
  await connection()
  return projectRepository(getDb()).count(await viewerWorkspaceId())
}

export async function getProject(id: string) {
  await connection()
  return visibleProject(getDb(), id)
}

export async function getProjectHeader(id: string) {
  await connection()
  const db = getDb()
  const project = await visibleProject(db, id)
  if (!project) return undefined
  const [source, clips, transcript] = await Promise.all([
    assetRepository(db).findByKind(id, "source"),
    clipRepository(db).listForProject(id),
    transcriptRepository(db).get(id),
  ])
  return {
    project,
    source: source
      ? {
          url: mediaUrl(source.storageKey),
          durationMs: source.durationMs,
          width: source.width,
          height: source.height,
          bytes: source.bytes,
        }
      : null,
    aspect:
      source?.width && source.height
        ? classifyAspect(source.width, source.height)
        : null,
    language:
      transcript?.language ??
      project.sourceLanguage ??
      (project.settings.language === "auto" ? null : project.settings.language),
    clipCount: clips.filter((c) => c.status !== "rejected").length,
    reviewCount: clips.filter((c) => c.status === "candidate").length,
  }
}

export type ProjectHeaderData = NonNullable<
  Awaited<ReturnType<typeof getProjectHeader>>
>

export async function getSearchIndex() {
  return projectRepository(getDb()).searchIndex(await viewerWorkspaceId())
}

export async function getProjectOverview(id: string) {
  await connection()
  const db = getDb()
  const project = await visibleProject(db, id)
  if (!project) return undefined
  const [assets, audio, clips, jobs, snapshot, transcript] = await Promise.all([
    assetRepository(db).listForProject(id),
    audioSummary(db, project),
    clipRepository(db).listForProject(id),
    jobQueue(db).listForProject(id),
    getProjectSnapshot(db, id),
    transcriptRepository(db).get(id),
  ])
  const { workspace } = await requireViewer()
  return {
    project,
    transcript: transcript
      ? {
          words: transcript.words.length,
          language: transcript.language,
          languageSource: transcript.languageSource,
        }
      : null,
    transcription: {
      skipped:
        !transcript &&
        jobs.some((j) => j.type === "transcribe" && j.status === "succeeded"),
      available: transcriptionAvailable(workspace),
    },
    source: assets.find((a) => a.kind === "source"),
    thumbnail: assets.find((a) => a.kind === "thumbnail"),
    proxy: assets.find((a) => a.kind === "proxy"),
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
  const project = await visibleProject(db, id)
  if (!project) return undefined
  const [assets, transcript, audio, clips] = await Promise.all([
    assetRepository(db).listForProject(id),
    transcriptRepository(db).get(id),
    audioSummary(db, project),
    clipRepository(db).listForProject(id),
  ])
  return {
    project,
    clips: clips
      .filter((clip) => clip.status !== "rejected")
      .map(({ id, title, startMs, endMs }) => ({ id, title, startMs, endMs })),
    proxy: assets.find((a) => a.kind === "proxy"),
    source: assets.find((a) => a.kind === "source"),
    transcript,
    transcriptionAvailable: transcriptionAvailable(
      (await requireViewer()).workspace
    ),
    audio,
  }
}

export async function getProjectClips(id: string) {
  await connection()
  const db = getDb()
  const project = await visibleProject(db, id)
  if (!project) return undefined
  const [assets, clips, audio, transcript, snapshot] = await Promise.all([
    assetRepository(db).listForProject(id),
    clipRepository(db).listForProject(id),
    audioSummary(db, project),
    transcriptRepository(db).get(id),
    getProjectSnapshot(db, id),
  ])
  const source = assets.find((a) => a.kind === "source")
  const durationMs = source?.durationMs ?? 0
  let manualPrompt: string | undefined
  if (project.awaitingManualSelection) {
    const signals = await signalsRepository(db).get(id)
    const playbook = await loadPlaybook(db, project.workspaceId)
    manualPrompt = buildManualPrompt({
      durationMs,
      words: transcript?.words ?? [],
      language: transcript?.language ?? project.settings.language,
      audience: project.audienceHeatmap ?? [],
      niche: NICHE_PROFILES[resolveNiche(project.settings.niche, project.name)],
      playbook: playbook?.selection,
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
  const words = speakerTranscriptWords(transcript)
  const captions = Object.fromEntries(
    clips.map((clip) => {
      const style = resolveCaptionStyle(
        clip.captionOverrides?.style ?? project.settings.captionStyle
      )
      return [
        clip.id,
        {
          lanes: clipCaptionLanes(
            timelineItems(words, clipParts(clip)),
            clip,
            style,
            null
          ),
          style,
          enabled: clipCaptionsEnabled(clip, project.settings),
        },
      ]
    })
  )
  const edit = assets.find((a) => a.kind === "edit")
  return {
    project,
    clips,
    captions,
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
    snapshot: snapshot!,
  }
}

export async function getClipEditor(projectId: string, clipId: string) {
  await connection()
  const db = getDb()
  const [project, clip] = await Promise.all([
    visibleProject(db, projectId),
    clipRepository(db).get(clipId),
  ])
  if (!project || !clip || clip.projectId !== project.id) return undefined
  const [assets, transcript, snapshot, clips, musicTracks, signals] =
    await Promise.all([
      assetRepository(db).listForProject(projectId),
      transcriptRepository(db).get(projectId),
      getProjectSnapshot(db, projectId),
      clipRepository(db).listForProject(projectId),
      project.workspaceId ? musicTracksFor(db, project.workspaceId) : [],
      signalsRepository(db).get(projectId),
    ])
  const order = clips
    .filter((c) => c.status !== "rejected" || c.id === clip.id)
    .toSorted((a, b) => b.score - a.score)
    .map((c) => c.id)
  const position = order.indexOf(clip.id)
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
    words: speakerTranscriptWords(transcript),
    siblings: {
      index: position,
      count: order.length,
      previousId: order[position - 1] ?? null,
      nextId: order[position + 1] ?? null,
    },
    render: render
      ? {
          url: mediaUrl(render.storageKey),
          downloadUrl: mediaUrl(render.storageKey, {
            download: `${slugify(clip.title)}.mp4`,
          }),
          createdAt: render.createdAt,
          bytes: render.bytes,
          width: render.width,
          height: render.height,
          durationMs: render.durationMs,
        }
      : undefined,
    snapshot: snapshot!,
    musicTracks,
    loudness: signals
      ? sourceLoudness(signals.loudness, signals.loudnessIntervalMs, clip)
      : null,
  }
}

const LOUDNESS_PADDING_MS = 3 * 60_000

function sourceLoudness(
  lufs: readonly number[],
  intervalMs: number,
  clip: Parted
) {
  const parts = clipParts(clip)
  const first = parts[0]!
  const last = parts.at(-1)!
  const at = (ms: number) => Math.max(0, Math.floor(ms / intervalMs))
  const from = at(first.startMs - LOUDNESS_PADDING_MS)
  const to = Math.ceil((last.endMs + LOUDNESS_PADDING_MS) / intervalMs)
  if (parts.length === 1) {
    return {
      fromMs: from * intervalMs,
      intervalMs,
      values: normalizeLoudness(lufs.slice(from, to)),
    }
  }
  // Laid out on the clip's timeline: the parts' loudness back to back, with
  // the recording around the first and last part on either side.
  const lead = lufs.slice(from, at(first.startMs))
  return {
    fromMs: first.startMs - lead.length * intervalMs,
    intervalMs,
    values: normalizeLoudness([
      ...lead,
      ...parts.flatMap((part) =>
        lufs.slice(
          at(part.startMs),
          Math.max(at(part.startMs) + 1, at(part.endMs))
        )
      ),
      ...lufs.slice(at(last.endMs), to),
    ]),
  }
}

export type SourceLoudness = NonNullable<ReturnType<typeof sourceLoudness>>

export async function getProjectSettings(id: string) {
  await connection()
  const db = getDb()
  const project = await visibleProject(db, id)
  if (!project) return undefined
  const [source, transcript] = await Promise.all([
    assetRepository(db).findByKind(id, "source"),
    transcriptRepository(db).get(id),
  ])
  const { workspace } = await requireViewer()
  return {
    project,
    audioTracks: source?.audioTracks ?? [],
    transcript: transcript
      ? { language: transcript.language, source: transcript.languageSource }
      : null,
    claudeAvailable: claudeAvailable(),
    transcriptionOff: !transcriptionAvailable(workspace),
  }
}

export type ProjectSettingsData = NonNullable<
  Awaited<ReturnType<typeof getProjectSettings>>
>
