import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import type { AudioSummary } from "@/features/projects/queries"

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
}: {
  audio: AudioSummary
  durationMs: number
}) {
  const silentShare = durationMs
    ? Math.round((audio.silentMs / durationMs) * 100)
    : 0
  return (
    <section aria-labelledby="audio-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="audio-heading" className="font-heading text-lg font-medium">
          Audio
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid="audio-summary"
        >
          {audio.silences.length}{" "}
          {audio.silences.length === 1 ? "silence" : "silences"} · {silentShare}
          % silent
          {audio.audience.length > 0 &&
            " · top band: most rewatched on YouTube"}
        </p>
      </div>
      <Timeline
        readOnly
        durationMs={durationMs}
        aria-label={`Loudness over time with ${audio.silences.length} silent stretches${audio.audience.length > 0 ? " and YouTube replay activity" : ""}`}
      >
        <AudioTimelineLayers audio={audio} />
      </Timeline>
    </section>
  )
}
