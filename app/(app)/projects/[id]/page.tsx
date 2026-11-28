import { ArrowRightIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AudioOverview } from "@/components/projects/audio-timeline"
import { ProjectOverview } from "@/components/projects/project-overview"
import { SourcePreview } from "@/components/projects/source-preview"
import { overview as messages } from "@/components/projects/messages/overview"
import { DotMeter } from "@/components/ui/dot-meter"
import { getMessages } from "@/lib/i18n/server"
import { getProject, getProjectOverview } from "@/features/projects/queries"
import { formatDuration, mediaUrl } from "@/lib/format"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params
  return {
    title:
      (await getProject(id))?.name ?? (await getMessages(messages)).page.title,
  }
}

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params
  const [overview, { page: t }] = await Promise.all([
    getProjectOverview(id),
    getMessages(messages),
  ])
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
    transcription,
  } = overview
  const kept = clips.filter((c) => c.status !== "rejected")
  const top = kept.toSorted((a, b) => b.score - a.score).slice(0, 3)

  return (
    <div className="flex flex-wrap items-start gap-[22px]">
      <div className="grid min-w-0 flex-[999_1_520px] gap-[22px]">
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
            transcription,
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
        />
      </div>
      <div className="grid min-w-0 flex-[1_1_340px] gap-[22px]">
        <SourcePreview
          videoSrc={
            proxy
              ? mediaUrl(proxy.storageKey)
              : source
                ? mediaUrl(source.storageKey)
                : null
          }
          thumbnailSrc={thumbnail ? mediaUrl(thumbnail.storageKey) : null}
          durationMs={source?.durationMs ?? null}
        />
        {audio && source?.durationMs ? (
          <AudioOverview
            audio={audio}
            durationMs={source.durationMs}
            clips={kept}
          />
        ) : null}
        {top.length > 0 && (
          <section className="grid gap-1 rounded-[18px] bg-graphite p-[22px]">
            <div className="flex items-baseline justify-between gap-2 pb-1.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
                {t.topPicks}
              </h2>
              <Link
                href={`/projects/${project.id}/clips`}
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
              >
                {t.all(kept.length)}
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </Link>
            </div>
            <ul>
              {top.map((clip) => (
                <li
                  key={clip.id}
                  className="shadow-[inset_0_-1px_0_var(--hair)] last:shadow-none"
                >
                  <Link
                    href={`/projects/${project.id}/clips/${clip.id}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <span
                      aria-hidden
                      className="h-[52px] w-[30px] shrink-0 rounded-[7px] bg-graphite-2 bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.07)_1px,transparent_1.5px)] bg-size-[11px_11px]"
                    />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="truncate text-sm font-medium">
                        {clip.title}
                      </span>
                      <span className="flex items-center gap-2.5 text-xs text-tertiary">
                        <DotMeter
                          value={Math.round(clip.score * 10)}
                          max={10}
                          aria-label={t.score(Math.round(clip.score * 100))}
                        />
                        <span className="font-mono tabular-nums">
                          {formatDuration(clip.startMs)} ·{" "}
                          {formatDuration(clip.endMs - clip.startMs)}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
