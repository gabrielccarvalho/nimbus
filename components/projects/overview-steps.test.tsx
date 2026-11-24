import { describe, expect, it } from "vitest"

import { stepDetails, stepTimes, webcamCorner } from "./overview-steps"

const job = (
  type: string,
  startedAt: string,
  finishedAt: string,
  status = "succeeded"
) =>
  ({
    id: type + startedAt,
    type,
    status,
    progress: 100,
    attempts: 1,
    error: null,
    clipId: null,
    startedAt,
    finishedAt,
    detail: null,
  }) as never

describe("stepDetails", () => {
  it("describes what each finished step produced", () => {
    const details = stepDetails({
      sourceUrl: "https://www.youtube.com/watch?v=x",
      selectorMode: "anthropic",
      renderQuality: "standard",
      source: {
        bytes: 1.6 * 1024 ** 3,
        durationMs: 3_066_000,
        width: 1920,
        height: 1080,
        fps: 59.94,
      },
      transcript: { words: 6587, language: "pt", languageSource: "source" },
      silences: 12,
      clipCount: 12,
      layout: {
        confirmed: true,
        mode: "cam-top",
        camPosition: "top",
        hasWebcam: true,
        width: 1920,
        height: 1080,
      },
    })
    expect(details).toMatchObject({
      upload: "YouTube · 1.6 GB",
      probe: "51:06 · 1920×1080 · 60 fps",
      transcribe: "6,587 words · Portuguese, from the video page",
      analyze: "12 silences · loudness peaks marked",
      select: "12 clips picked and titled by Claude",
      layout: "Webcam on top · saved for 1920×1080",
      render: "Approved clips only · Standard quality",
    })
  })

  it("leaves unfinished steps empty", () => {
    const details = stepDetails({
      sourceUrl: null,
      selectorMode: "heuristic",
      renderQuality: "draft",
      source: null,
      transcript: null,
      silences: null,
      clipCount: 0,
      layout: null,
    })
    expect(details.probe).toBeNull()
    expect(details.select).toBeNull()
    expect(details.layout).toBeNull()
  })
})

describe("stepTimes", () => {
  it("times finished jobs and sums renders", () => {
    const times = stepTimes([
      job("probe", "2026-11-24T10:00:00Z", "2026-11-24T10:00:24Z"),
      job("render_clip", "2026-11-24T10:01:00Z", "2026-11-24T10:01:10Z"),
      job("render_clip", "2026-11-24T10:02:00Z", "2026-11-24T10:02:05Z"),
      job(
        "transcribe",
        "2026-11-24T10:00:30Z",
        "2026-11-24T10:00:40Z",
        "failed"
      ),
    ])
    expect(times).toEqual({ probe: 24_000, render: 15_000 })
  })
})

describe("webcamCorner", () => {
  it("names where the webcam sits", () => {
    expect(webcamCorner({ x: 0.75, y: 0.7, w: 0.2, h: 0.25 })).toBe(
      "the bottom-right corner"
    )
    expect(webcamCorner({ x: 0.02, y: 0.02, w: 0.2, h: 0.2 })).toBe(
      "the top-left corner"
    )
    expect(webcamCorner({ x: 0.4, y: 0.75, w: 0.2, h: 0.2 })).toBe(
      "the bottom edge"
    )
  })
})
