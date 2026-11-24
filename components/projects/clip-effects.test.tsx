import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VideoPlayerProvider } from "@/components/ui/video-player"
import { resolveCaptionStyle } from "@/features/captions/styles"
import { planClipEffectsAction } from "@/features/clips/actions"
import type { ClipEffects } from "@/features/effects/schema"
import type { LayoutInput } from "@/features/layout/schema"

import { ClipEffectsCard, ClipEffectsPreview } from "./clip-effects"

vi.mock("@/features/clips/actions", () => ({
  planClipEffectsAction: vi.fn(),
}))

const layout: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
  camPosition: "top",
}

const planned: ClipEffects = {
  edited: false,
  events: [{ kind: "shake", startMs: 4000, endMs: 4500, intensity: "light" }],
}

beforeEach(() => {
  vi.mocked(planClipEffectsAction).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

describe("ClipEffectsCard", () => {
  it("plans effects for the unsaved range and layout", async () => {
    vi.mocked(planClipEffectsAction).mockResolvedValue({
      ok: true,
      value: planned,
    })
    const onEffectsChange = vi.fn()
    render(
      <VideoPlayerProvider>
        <ClipEffectsCard
          projectId="p1"
          clipId="c1"
          startMs={3000}
          endMs={9000}
          layoutOverride={layout}
          hasWebcam={false}
          effects={null}
          onEffectsChange={onEffectsChange}
          selected={null}
          onSelectedChange={vi.fn()}
        />
      </VideoPlayerProvider>
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Add effects automatically" })
    )
    expect(planClipEffectsAction).toHaveBeenCalledWith("p1", "c1", {
      startMs: 3000,
      endMs: 9000,
      layoutOverride: layout,
    })
    await waitFor(() => expect(onEffectsChange).toHaveBeenCalledWith(planned))
  })
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
          pages={[]}
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
