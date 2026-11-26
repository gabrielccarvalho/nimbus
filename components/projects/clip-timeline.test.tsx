import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { VideoPlayerProvider } from "@/components/ui/video-player"
import type { TextOverlay } from "@/features/captions/overlay"
import type { CaptionPage } from "@/features/captions/pages"
import type { ClipEffects } from "@/features/effects/schema"
import {
  DEFAULT_AUDIO_MIX,
  newMusicClip,
  type AudioMix,
  type ReadyMusicTrack,
} from "@/features/music/schema"
import type { CaptionState } from "@/features/timeline/captions"

import {
  ClipTimeline,
  rulerTicks,
  type TimelineSelection,
} from "./clip-timeline"

vi.mock("@/features/clips/actions", () => ({
  planClipEffectsAction: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const track: ReadyMusicTrack = {
  id: "t1",
  title: "Synthwave",
  url: "/api/music/t1",
  usedBy: 0,
  status: "ready",
  durationMs: 60_000,
  peaks: Array.from({ length: 240 }, () => 0.8),
  error: null,
}

const spoken: CaptionPage[] = [
  {
    index: 0,
    startMs: 1000,
    endMs: 2000,
    words: [{ text: "hello", startMs: 1000, endMs: 2000 }],
    lines: [1],
  },
]

type State = {
  startMs: number
  endMs: number
  effects: ClipEffects | null
  captions: CaptionState
  captionsEnabled: boolean
  textOverlays: TextOverlay[]
  audioMix: AudioMix
  selection: TimelineSelection | null
}

function setup(initial: Partial<State> = {}, hasWebcam = true) {
  const changes: State[] = []
  function Harness() {
    const [state, setState] = React.useState<State>({
      startMs: 10_000,
      endMs: 40_000,
      effects: null,
      captions: { pageEdits: {}, offsetMs: 0, added: [], lanes: [] },
      captionsEnabled: true,
      textOverlays: [],
      audioMix: DEFAULT_AUDIO_MIX,
      selection: null,
      ...initial,
    })
    React.useEffect(() => {
      changes.push(state)
    })
    const set = (patch: Partial<State>) =>
      setState((current) => ({ ...current, ...patch }))
    return (
      <VideoPlayerProvider>
        <ClipTimeline
          projectId="p1"
          clipId="c1"
          sourceDurationMs={120_000}
          startMs={state.startMs}
          endMs={state.endMs}
          onTrim={(startMs, endMs) => set({ startMs, endMs })}
          layout={{
            webcamRect: null,
            gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
            gameplayFocusX: 0.5,
            mode: "no-cam-fill",
            camPosition: "top",
          }}
          hasWebcam={hasWebcam}
          effects={state.effects}
          onEffectsChange={(effects) => set({ effects })}
          spokenPages={spoken}
          captions={state.captions}
          onCaptionsChange={(captions) => set({ captions })}
          captionsEnabled={state.captionsEnabled}
          onCaptionsEnabledChange={(captionsEnabled) =>
            set({ captionsEnabled })
          }
          captionBaseline={0.8}
          textOverlays={state.textOverlays}
          onTextOverlaysChange={(textOverlays) => set({ textOverlays })}
          hook="Wait for it"
          title="Clip"
          captionsNearTop={false}
          audioMix={state.audioMix}
          onAudioMixChange={(audioMix) => set({ audioMix })}
          tracks={[track]}
          trending={Promise.resolve({ status: "no_channel" })}
          loudness={{
            fromMs: 0,
            intervalMs: 250,
            values: Array.from({ length: 480 }, () => 1),
          }}
          previewUnavailable={false}
          selection={state.selection}
          onSelectionChange={(selection) => set({ selection })}
        />
      </VideoPlayerProvider>
    )
  }
  render(<Harness />)
  return { latest: () => changes.at(-1)! }
}

const volume = (name: string) =>
  screen.findByLabelText(name, { selector: "input" })

const barHeight = (svg: Element) => {
  const d = svg.querySelector("path")!.getAttribute("d")!
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
  return Math.round((50 - Math.min(...ys)) * 2)
}

async function addEffect(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "Effect" }))
  await userEvent.click(await screen.findByRole("menuitem", { name }))
}

describe("ClipTimeline", () => {
  it("adds effects at the playhead and overflows into a new track", async () => {
    const { latest } = setup()
    await addEffect("Zoom")
    await addEffect("Full game")
    expect(latest().effects?.events).toMatchObject([
      { kind: "zoom", startMs: 10_000, lane: 0 },
      { kind: "focus", target: "game", startMs: 10_000, lane: 1 },
    ])
    expect(
      screen.getByRole("group", { name: "Effects track 2" })
    ).toBeInTheDocument()
  })

  it("can't add a full cam without a webcam", async () => {
    setup({}, false)
    await userEvent.click(screen.getByRole("button", { name: "Effect" }))
    expect(
      await screen.findByRole("menuitem", { name: "Full cam" })
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("moves an effect to an empty track from the keyboard", async () => {
    const { latest } = setup({
      effects: {
        edited: true,
        events: [
          { kind: "shake", startMs: 12_000, endMs: 12_500, intensity: "light" },
        ],
      },
    })
    await userEvent.click(screen.getByRole("button", { name: "Track" }))
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Effects track" })
    )
    const block = screen.getByRole("button", { name: "Shake light at 0:02.0" })
    block.focus()
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(latest().effects?.events[0]).toMatchObject({ lane: 1 })
    expect(
      within(screen.getByRole("group", { name: "Effects track 2" })).getByRole(
        "button"
      )
    ).toHaveAccessibleName("Shake light at 0:02.0")
  })

  it("edits a spoken caption and a written one from the inspector", async () => {
    const { latest } = setup()
    await userEvent.click(
      screen.getByRole("button", { name: "Caption hello at 0:01.0" })
    )
    const text = await screen.findByLabelText("Caption text")
    await userEvent.clear(text)
    expect(text).toHaveAccessibleDescription("Write the caption or delete it")
    expect(latest().captions.pageEdits).toEqual({})
    await userEvent.type(text, "Hi")
    expect(latest().captions.pageEdits).toEqual({ 0: { text: "Hi" } })

    await userEvent.click(screen.getByRole("button", { name: "Caption" }))
    expect(latest().captions.added).toEqual([
      { startMs: 0, endMs: 1000, text: "New caption" },
    ])
    expect(await screen.findByText("Written caption")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(latest().captions.added).toEqual([])
  })

  it("puts a caption on a new captions track when the first is busy", async () => {
    const { latest } = setup()
    await userEvent.click(screen.getByRole("button", { name: "Caption" }))
    await userEvent.click(screen.getByRole("button", { name: "Caption" }))
    expect(latest().captions.added).toHaveLength(1)
    expect(latest().captions.lanes).toEqual([
      {
        baseline: 0.65,
        captions: [{ startMs: 0, endMs: 1500, text: "New caption" }],
      },
    ])
    expect(
      screen.getByRole("group", { name: "Captions track 2" })
    ).toBeInTheDocument()
  })

  it("adds a text and places it on another track", async () => {
    const { latest } = setup()
    await userEvent.click(screen.getByRole("button", { name: "Text" }))
    expect(latest().textOverlays).toEqual([
      {
        text: "Wait for it",
        position: "top",
        startMs: 0,
        endMs: 3000,
        lane: 0,
      },
    ])
    await userEvent.click(screen.getByRole("button", { name: "Text" }))
    expect(latest().textOverlays[1]).toMatchObject({ startMs: 0, lane: 1 })
  })

  it("adds a library track as music and scales its wave with the volume", async () => {
    const { latest } = setup()
    await userEvent.click(screen.getByRole("button", { name: "Music" }))
    await userEvent.click(await screen.findByRole("combobox"))
    await userEvent.click(
      await screen.findByRole("option", { name: /Synthwave/ })
    )
    expect(latest().audioMix.music).toEqual([
      newMusicClip("t1", { startMs: 0, endMs: 30_000, lane: 0 }),
    ])
    const wave = screen.getByTestId("music-waveform")
    const before = barHeight(wave)
    const slider = await volume("Music volume")
    for (let i = 0; i < 4; i++) fireEvent.keyDown(slider, { key: "ArrowDown" })
    expect(latest().audioMix.music[0]!.db).toBe(-20)
    expect(barHeight(screen.getByTestId("music-waveform"))).toBeLessThan(before)
  })

  it("lowers the original audio wave with its volume and flattens it when muted", async () => {
    const { latest } = setup()
    const before = barHeight(screen.getByTestId("source-waveform"))
    await userEvent.click(
      screen.getByRole("button", { name: "Original audio 0 dB" })
    )
    const slider = await volume("Original audio volume")
    fireEvent.keyDown(slider, { key: "ArrowDown" })
    fireEvent.keyDown(slider, { key: "ArrowDown" })
    expect(latest().audioMix.sourceDb).toBe(-2)
    expect(barHeight(screen.getByTestId("source-waveform"))).toBeLessThan(
      before
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Mute original audio" })
    )
    expect(barHeight(screen.getByTestId("source-waveform"))).toBe(2)
  })

  it("trims the clip from the video track", async () => {
    const { latest } = setup()
    const video = screen.getByRole("button", {
      name: "Clip 0:10.0 → 0:40.0",
    })
    video.focus()
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() =>
      expect(latest()).toMatchObject({ startMs: 10_100, endMs: 40_100 })
    )
  })

  it("zooms every track together", async () => {
    setup()
    const content = screen.getByTestId("timeline-scroller")
      .firstElementChild as HTMLElement
    const width = () => content.style.width
    const at = width()
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(width()).not.toBe(at)
    expect(width()).toMatch(/max\(100%, \d+px\)/)
    await userEvent.click(screen.getByRole("button", { name: "Fit" }))
    expect(width()).toBe("100%")
  })

  it("removes an empty captions track", async () => {
    const { latest } = setup({
      captions: {
        pageEdits: {},
        offsetMs: 0,
        added: [],
        lanes: [{ baseline: 0.65, captions: [] }],
      },
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Remove captions track 2" })
    )
    expect(latest().captions.lanes).toEqual([])
  })
})

describe("rulerTicks", () => {
  it("spaces ticks so their labels don't collide, including before the clip", () => {
    expect(rulerTicks(-5000, 30_000, 350)).toEqual([0, 10_000, 20_000, 30_000])
    expect(rulerTicks(-2000, 4000, 700)).toEqual([
      -2000, -1000, 0, 1000, 2000, 3000, 4000,
    ])
    expect(rulerTicks(0, 0, 500)).toEqual([])
  })
})
