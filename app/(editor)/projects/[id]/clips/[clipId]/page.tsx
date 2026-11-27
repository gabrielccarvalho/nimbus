import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ClipEditor } from "@/components/projects/clip-editor"
import { editor } from "@/components/projects/messages/editor"
import { getMessages } from "@/lib/i18n/server"
import { getTrendingMusic } from "@/features/music/queries"
import { getClipEditor, getProjectSettings } from "@/features/projects/queries"
import { getPublishing } from "@/features/publishing/queries"
import { installedCaptionFonts } from "@/features/render/fonts"
import { mediaUrl } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]/clips/[clipId]">): Promise<Metadata> {
  const { id, clipId } = await params
  const [data, t] = await Promise.all([
    getClipEditor(id, clipId),
    getMessages(editor),
  ])
  return { title: data ? t.page.title(data.clip.title) : t.page.fallbackTitle }
}

export default async function ClipEditorPage({
  params,
}: PageProps<"/projects/[id]/clips/[clipId]">) {
  const { id, clipId } = await params
  const data = await getClipEditor(id, clipId)
  if (!data?.video || !data.source?.durationMs) notFound()
  const [publishing, settingsData] = await Promise.all([
    getPublishing(id),
    getProjectSettings(id),
  ])
  if (!settingsData) notFound()
  const { project, clip, video, source } = data

  return (
    <ClipEditor
      key={clip.id}
      projectId={project.id}
      projectName={project.name}
      clip={clip}
      src={mediaUrl(video.storageKey)}
      sourceDurationMs={source.durationMs!}
      sourceWidth={source.width ?? 1920}
      sourceHeight={source.height ?? 1080}
      fps={source.fps}
      words={data.words.filter(
        (w) =>
          w.endMs >= clip.startMs - 60_000 && w.startMs <= clip.endMs + 60_000
      )}
      settings={project.settings}
      settingsData={settingsData}
      installedFonts={installedCaptionFonts()}
      render={data.render}
      snapshot={data.snapshot}
      siblings={data.siblings}
      publishing={publishing}
      musicTracks={data.musicTracks}
      trendingMusic={getTrendingMusic()}
      loudness={data.loudness}
    />
  )
}
