import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import type { AudioSummary } from "@/features/projects/queries"
import { formatDuration } from "@/lib/format"

export function AudioTimelineLayers({ audio }: { audio: AudioSummary }) {
  return (
    <>
      <TimelineLoudness values={audio.loudness} />
      {audio.audience.map((point) => (
        <TimelineRange
          key={point.startMs}
          variant="audience"
          startMs={point.startMs}
          endMs={point.endMs}
          style={{ opacity: point.value }}
        />
      ))}
      {audio.silences.map((silence) => (
        <TimelineRange
          key={silence.startMs}
          variant="silence"
          startMs={silence.startMs}
          endMs={silence.endMs}
        />
      ))}
    </>
  )
}

export function AudioOverview({
  audio,
  durationMs,
  clips = [],
}: {
  audio: AudioSummary
  durationMs: number
  clips?: readonly { startMs: number; endMs: number }[]
}) {
  const silentShare = durationMs
    ? Math.round((audio.silentMs / durationMs) * 100)
    : 0
  return (
    <section
      aria-labelledby="audio-heading"
      className="grid gap-3.5 rounded-[18px] bg-graphite p-[22px]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="audio-heading"
          className="text-[15px] font-semibold tracking-[-0.015em]"
        >
          Where the clips are
        </h2>
        <span className="text-[13px] text-tertiary">
          {clips.length} across {formatDuration(durationMs)}
        </span>
      </div>
      <Timeline
        readOnly
        durationMs={durationMs}
        aria-label={`Loudness over time with ${audio.silences.length} silent stretches${audio.audience.length > 0 ? " and YouTube replay activity" : ""}`}
      >
        <AudioTimelineLayers audio={audio} />
        {clips.map((clip) => (
          <TimelineRange
            key={clip.startMs}
            className="min-w-1"
            startMs={clip.startMs}
            endMs={clip.endMs}
          />
        ))}
      </Timeline>
      <div
        aria-hidden
        className="flex justify-between font-mono text-[11px] text-tertiary tabular-nums"
      >
        <span>0:00</span>
        <span>{formatDuration(durationMs / 2)}</span>
        <span>{formatDuration(durationMs)}</span>
      </div>
      <p className="text-[13px] text-tertiary" data-testid="audio-summary">
        {audio.silences.length}{" "}
        {audio.silences.length === 1 ? "silence" : "silences"} · {silentShare}%
        silent
        {audio.audience.length > 0 && " · top band: most rewatched on YouTube"}
      </p>
    </section>
  )
}
