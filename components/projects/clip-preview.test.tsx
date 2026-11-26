import { fireEvent, render, screen } from "@testing-library/react"
import type * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  VideoPlayerProvider,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import { resolveCaptionStyle } from "@/features/captions/styles"
import type { Effect } from "@/features/effects/schema"
import type { LayoutInput } from "@/features/layout/schema"

import { ClipPreview } from "./clip-preview"

const layout: LayoutInput = {
  webcamRect: { x: 0.75, y: 0.7, w: 0.25, h: 0.3 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "cam-top",
  camPosition: "top",
}

const captionStyle = resolveCaptionStyle({ presetId: "" })

const effects: Effect[] = [
  { kind: "focus", startMs: 2000, endMs: 4000, target: "cam" },
]

let time = 0
const drawImage = vi.fn()

beforeEach(() => {
  time = 0
  drawImage.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  const proto = HTMLMediaElement.prototype
  Object.defineProperty(proto, "paused", { configurable: true, value: true })
  Object.defineProperty(proto, "duration", { configurable: true, value: 10 })
  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value
    },
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    value: 1920,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    value: 1080,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(
  ms: number,
  overlays?: React.ComponentProps<typeof ClipPreview>["overlays"]
) {
  time = ms / 1000
  const { container } = render(
    <VideoPlayerProvider>
      <VideoPlayerVideo src="/source.mp4" />
      <ClipPreview
        layout={layout}
        effects={effects}
        lanes={[]}
        startMs={0}
        captionStyle={captionStyle}
        captionsEnabled={false}
        overlays={overlays}
      />
    </VideoPlayerProvider>
  )
  fireEvent.loadedMetadata(container.querySelector("video")!)
  return container
}

describe("ClipPreview", () => {
  it("draws one full-canvas webcam region while a focus event is active", () => {
    renderAt(3000)
    const last = drawImage.mock.calls.at(-1)!
    const canvas = document.querySelector("canvas")!
    expect(last[5]).toBe(0)
    expect(last[6]).toBe(0)
    expect(last[7]).toBeCloseTo(canvas.width)
    expect(last[8]).toBeCloseTo(canvas.height)
    expect(last[1]).toBeGreaterThanOrEqual(0.75 * 1920)
  })

  it("draws the stacked layout outside it", () => {
    renderAt(500)
    const [first, second] = drawImage.mock.calls.slice(-2)
    const canvas = document.querySelector("canvas")!
    expect(first![6]).toBe(0)
    expect(second![6]).toBeGreaterThan(0)
    expect(first![8] + second![8]).toBeCloseTo(canvas.height)
  })
})

describe("ClipPreview texts", () => {
  const texts = [
    {
      text: "Wait for it",
      position: "top",
      startMs: 1000,
      endMs: 3000,
      lane: 0,
    },
    { text: "Now", position: "center", startMs: 2000, endMs: 5000, lane: 1 },
  ] as const

  it("shows each text only while it's on the timeline", () => {
    renderAt(500, [...texts])
    expect(screen.queryByText("Wait for it")).toBeNull()
    expect(screen.queryByText("Now")).toBeNull()
  })

  it("shows overlapping texts together", () => {
    renderAt(2500, [...texts])
    expect(screen.getByText("Wait for it")).toBeInTheDocument()
    expect(screen.getByText("Now")).toBeInTheDocument()
  })

  it("hides a text once its time is up", () => {
    renderAt(4000, [...texts])
    expect(screen.queryByText("Wait for it")).toBeNull()
    expect(screen.getByText("Now")).toBeInTheDocument()
  })
})
