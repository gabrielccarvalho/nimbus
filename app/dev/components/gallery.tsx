"use client"

import {
  ClockIcon,
  FilmStripIcon,
  FolderSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  CropRegion,
  CropRegionEditor,
} from "@/components/ui/crop-region-editor"
import {
  Timeline,
  TimelineLoudness,
  TimelinePlayhead,
  TimelineRange,
} from "@/components/ui/timeline"
import {
  VideoPlayer,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import {
  Dropzone,
  DropzoneDescription,
  DropzoneIcon,
  DropzoneTitle,
} from "@/components/ui/dropzone"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  StatCard,
  StatCardGroup,
  StatCardIcon,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card"

const SAMPLE_LOUDNESS = Array.from({ length: 240 }, (_, i) =>
  i >= 80 && i < 104
    ? 0
    : 0.35 + 0.3 * Math.abs(Math.sin(i / 7)) + (i % 11) / 40
)

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={title}>
      <h2 id={title} className="font-heading text-lg font-medium">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function ComponentGallery() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-6">
      <h1 className="font-heading text-2xl font-semibold">Component gallery</h1>

      <Section title="Dropzone">
        <Dropzone
          accept={["video/*", ".mkv"]}
          maxSize={1024 ** 3}
          onFilesAccepted={(files) =>
            toast.success(`Accepted ${files[0]?.name}`)
          }
          onFilesRejected={(r) => toast.error(`Rejected: ${r[0]?.reason}`)}
        >
          <DropzoneIcon>
            <UploadSimpleIcon />
          </DropzoneIcon>
          <DropzoneTitle>Drop a recording or click to browse</DropzoneTitle>
          <DropzoneDescription>
            MP4, MOV, MKV or WebM up to 1 GiB
          </DropzoneDescription>
        </Dropzone>
        <Dropzone size="sm" disabled>
          <DropzoneTitle>Disabled, small</DropzoneTitle>
          <DropzoneDescription>Uploads are paused</DropzoneDescription>
        </Dropzone>
      </Section>

      <Section title="StatCard">
        {(["default", "muted", "ghost"] as const).map((variant) => (
          <StatCardGroup key={variant}>
            <StatCard variant={variant}>
              <StatCardLabel>
                <span className="truncate">Duration</span>
                <StatCardIcon>
                  <ClockIcon />
                </StatCardIcon>
              </StatCardLabel>
              <StatCardValue>1:02:44</StatCardValue>
            </StatCard>
            <StatCard variant={variant} size="sm">
              <StatCardLabel>
                <span className="truncate">Clips ({variant}, sm)</span>
                <StatCardIcon>
                  <FilmStripIcon />
                </StatCardIcon>
              </StatCardLabel>
              <StatCardValue>12</StatCardValue>
            </StatCard>
          </StatCardGroup>
        ))}
      </Section>

      <Section title="VideoPlayer">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          {(["video", "vertical"] as const).map((aspect) => (
            <VideoPlayer
              key={aspect}
              aspect={aspect}
              aria-label={`${aspect} player`}
            >
              <VideoPlayerVideo />
              <VideoPlayerControls>
                <VideoPlayerPlayButton />
                <VideoPlayerSeekBar />
                <VideoPlayerTime />
                <VideoPlayerMuteButton />
              </VideoPlayerControls>
            </VideoPlayer>
          ))}
        </div>
      </Section>

      <Section title="Timeline">
        <div className="flex flex-col gap-3">
          <Timeline
            aria-label="Interactive timeline"
            durationMs={60_000}
            defaultValue={15_000}
          >
            <TimelineLoudness values={SAMPLE_LOUDNESS} />
            <TimelineRange variant="silence" startMs={20_000} endMs={26_000} />
            <TimelineRange variant="clip" startMs={30_000} endMs={45_000}>
              Clip 1
            </TimelineRange>
            <TimelinePlayhead />
          </Timeline>
          <Timeline
            aria-label="Read-only timeline"
            durationMs={60_000}
            readOnly
            className="h-6"
          >
            <TimelineLoudness values={SAMPLE_LOUDNESS} />
          </Timeline>
        </div>
      </Section>

      <Section title="CropRegionEditor">
        <CropRegionEditor
          defaultValue={{ x: 0.7, y: 0.65, w: 0.25, h: 0.28 }}
          className="aspect-video max-w-xl bg-[repeating-linear-gradient(45deg,var(--color-muted)_0_12px,var(--color-background)_12px_24px)]"
        >
          <CropRegion aria-label="Example region" />
        </CropRegionEditor>
      </Section>

      <Section title="EmptyState (shadcn Empty)">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderSimpleIcon />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Upload a recording to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>Upload</Button>
          </EmptyContent>
        </Empty>
      </Section>
    </main>
  )
}
