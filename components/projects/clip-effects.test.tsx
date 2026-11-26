import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VideoPlayerProvider } from "@/components/ui/video-player"
import { resolveCaptionStyle } from "@/features/captions/styles"
import type { ClipEffects } from "@/features/effects/schema"
import type { LayoutInput } from "@/features/layout/schema"

import { ClipEffectsPreview } from "./clip-effects"

const layout: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
  camPosition: "top",
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

describe("ClipEffectsPreview", () => {
  it("sets the selected zoom's focus from a click", () => {
    const effects: ClipEffects = {
      edited: false,
      events: [
        {
          kind: "zoom",
          startMs: 60_000,
          endMs: 61_000,
          scale: 1.4,
          focus: { x: 0.5, y: 0.5 },
        },
      ],
    }
    const onEffectsChange = vi.fn()
    render(
      <VideoPlayerProvider>
        <ClipEffectsPreview
          layout={layout}
          source={{ width: 1920, height: 1080 }}
          effects={effects}
          selected={0}
          onEffectsChange={onEffectsChange}
          lanes={[]}
          startMs={0}
          captionStyle={resolveCaptionStyle({ presetId: "" })}
          captionsEnabled={false}
        />
      </VideoPlayerProvider>
    )
    const picker = screen.getByRole("button", { name: "Set zoom focus" })
    picker.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 270, height: 480 }) as DOMRect
    fireEvent.click(picker, { clientX: 135, clientY: 120 })
    expect(onEffectsChange).toHaveBeenCalledWith({
      edited: true,
      events: [{ ...effects.events[0], focus: { x: 0.5, y: 0.25 } }],
    })
  })
})
