import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BreadcrumbLabel } from "@/components/app-shell/breadcrumbs"
import { ClipEditor } from "@/components/projects/clip-editor"
import { getClipEditor } from "@/features/projects/queries"
import { installedCaptionFonts } from "@/features/render/fonts"
import { mediaUrl } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]/clips/[clipId]">): Promise<Metadata> {
  const { id, clipId } = await params
  const data = await getClipEditor(id, clipId)
  return { title: data ? `Edit ${data.clip.title}` : "Clip" }
}

export default async function ClipEditorPage({
  params,
}: PageProps<"/projects/[id]/clips/[clipId]">) {
  const { id, clipId } = await params
  const data = await getClipEditor(id, clipId)
  if (!data?.video || !data.layout || !data.source?.durationMs) notFound()
  const { project, clip, video, layout, source } = data

  return (
    <>
      <BreadcrumbLabel segment={clip.id} label={clip.title} />
      <ClipEditor
        key={clip.updatedAt.getTime()}
        projectId={project.id}
        clip={clip}
        src={mediaUrl(video.storageKey)}
        sourceDurationMs={source.durationMs!}
        layout={{
          webcamRect: layout.webcamRect,
          gameplayRect: layout.gameplayRect,
          gameplayFocusX: layout.gameplayFocusX,
          mode: layout.mode,
          camPosition: layout.camPosition,
        }}
        sourceWidth={source.width ?? 1920}
        sourceHeight={source.height ?? 1080}
        words={data.words.filter(
          (w) =>
            w.endMs >= clip.startMs - 60_000 && w.startMs <= clip.endMs + 60_000
        )}
        settings={project.settings}
        installedFonts={installedCaptionFonts()}
        render={data.render}
        snapshot={data.snapshot}
        siblings={data.siblings}
      />
    </>
  )
}
