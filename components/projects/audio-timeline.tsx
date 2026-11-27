import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import type { AudioSummary } from "@/features/projects/queries"
import { formatDuration } from "@/lib/format"

import { TimelineDock } from "./timeline-dock"

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
    <TimelineDock
      label="Where the clips are"
      durationMs={durationMs}
      summary={
        <span data-testid="audio-summary">
          {clips.length} across {formatDuration(durationMs)} ·{" "}
          {audio.silences.length}{" "}
          {audio.silences.length === 1 ? "silence" : "silences"} · {silentShare}
          % silent
        </span>
      }
      legend={[
        { kind: "clip", label: "Clip" },
        { kind: "silence", label: "Silence" },
        ...(audio.audience.length > 0
          ? [
              {
                kind: "audience" as const,
                label: "Most rewatched on YouTube",
              },
            ]
          : []),
      ]}
    >
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
    </TimelineDock>
  )
}
