import { ArrowRightIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AudioOverview } from "@/components/projects/audio-timeline"
import { ProjectOverview } from "@/components/projects/project-overview"
import { SourcePreview } from "@/components/projects/source-preview"
import { DotMeter } from "@/components/ui/dot-meter"
import { getProject, getProjectOverview } from "@/features/projects/queries"
import { formatDuration, mediaUrl } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: (await getProject(id))?.name ?? "Project" }
}

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params
  const overview = await getProjectOverview(id)
  if (!overview) notFound()
  const {
    project,
    source,
    thumbnail,
    proxy,
    clips,
    snapshot,
    audio,
    transcript,
  } = overview
  const kept = clips.filter((c) => c.status !== "rejected")
  const top = kept.toSorted((a, b) => b.score - a.score).slice(0, 3)

  const videoSrc = proxy
    ? mediaUrl(proxy.storageKey)
    : source
      ? mediaUrl(source.storageKey)
      : null

  return (
    <>
      <ProjectOverview
        initial={snapshot}
        facts={{
          sourceUrl: project.sourceUrl,
          selectorMode: project.settings.selectorMode,
          renderQuality: project.settings.renderQuality,
          source: source
            ? {
                bytes: source.bytes,
                durationMs: source.durationMs,
                width: source.width,
                height: source.height,
                fps: source.fps,
              }
            : null,
          transcript,
          silences: audio ? audio.silences.length : null,
          clipCount: kept.length,
        }}
        clips={kept.map((clip) => ({
          id: clip.id,
          title: clip.title,
          startMs: clip.startMs,
          endMs: clip.endMs,
        }))}
        videoSrc={proxy ? mediaUrl(proxy.storageKey) : null}
      >
        <div className="flex flex-wrap items-start gap-[18px]">
          <div className="grid min-w-0 flex-[999_1_420px] gap-2">
            <span className="flex h-6 items-center mono-label">Source</span>
            <SourcePreview
              videoSrc={videoSrc}
              thumbnailSrc={thumbnail ? mediaUrl(thumbnail.storageKey) : null}
              durationMs={source?.durationMs ?? null}
            />
          </div>
          {top.length > 0 && (
            <section
              aria-labelledby="top-picks"
              className="grid min-w-0 flex-[1_1_300px] gap-2"
            >
              <div className="flex h-6 items-center justify-between gap-2">
                <h2 id="top-picks" className="mono-label">
                  Top picks · 9:16
                </h2>
                <Link
                  href={`/projects/${project.id}/clips`}
                  className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  All {kept.length}
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              </div>
              <ul className="grid grid-cols-3 gap-3">
                {top.map((clip, index) => (
                  <li key={clip.id} className="min-w-0">
                    <Link
                      href={`/projects/${project.id}/clips/${clip.id}`}
                      className="grid gap-2"
                    >
                      <span className="relative block aspect-[9/16] overflow-hidden rounded-[14px] bg-graphite-2 inset-ring-1 inset-ring-white/10">
                        {videoSrc && (
                          <video
                            aria-hidden
                            muted
                            playsInline
                            preload="metadata"
                            src={`${videoSrc}#t=${(clip.startMs / 1000).toFixed(1)}`}
                            className="absolute inset-0 size-full object-cover"
                          />
                        )}
                        <span
                          aria-hidden
                          className="absolute start-2 top-2 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold"
                        >
                          #{index + 1}
                        </span>
                        <span
                          aria-hidden
                          className="absolute end-2 top-2 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold"
                        >
                          {formatDuration(clip.endMs - clip.startMs)}
                        </span>
                      </span>
                      <span className="truncate text-[13px] font-medium">
                        {clip.title}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-tertiary">
                        <DotMeter
                          value={Math.round(clip.score * 10)}
                          max={10}
                          aria-label={`Score ${Math.round(clip.score * 100)}`}
                        />
                        <span className="font-mono tabular-nums">
                          {formatDuration(clip.startMs)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ProjectOverview>
      {audio && source?.durationMs ? (
        <AudioOverview
          audio={audio}
          durationMs={source.durationMs}
          clips={kept}
        />
      ) : null}
    </>
  )
}
