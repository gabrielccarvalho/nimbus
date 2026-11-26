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

import {
  VideoPlayerProvider,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
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
  const onPlanEffects = vi.fn()
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
        <VideoPlayerVideo data-testid="source" />
        <ClipTimeline
          src="/media/proxy.mp4"
          sourceDurationMs={120_000}
          startMs={state.startMs}
          endMs={state.endMs}
          onTrim={(startMs, endMs) => set({ startMs, endMs })}
          hasWebcam={hasWebcam}
          effects={state.effects}
          onEffectsChange={(effects) => set({ effects })}
          onPlanEffects={onPlanEffects}
          planning={false}
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
  return { latest: () => changes.at(-1)!, onPlanEffects }
}

function layOut(viewWidth: number) {
  const scroller = screen.getByTestId("timeline-scroller")
  const axis = scroller.firstElementChild as HTMLElement
  const axisWidth = () => Number(/(\d+)px/.exec(axis.style.width)?.[1] ?? 0)
  axis.getBoundingClientRect = () =>
    ({ left: 32 - scroller.scrollLeft, width: axisWidth() }) as DOMRect
  scroller.getBoundingClientRect = () =>
    ({ left: 0, width: viewWidth }) as DOMRect
  Object.defineProperty(scroller, "clientWidth", { get: () => viewWidth })
  Object.defineProperty(scroller, "scrollWidth", {
    get: () => axisWidth() + 64,
  })
  fireEvent.scroll(scroller)
  return { scroller, axis, axisWidth }
}

const volume = (name: string) =>
  screen.findByLabelText(name, { selector: "input" })

const barHeight = (svg: Element) => {
  const d = svg.querySelector("path")!.getAttribute("d")!
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
  return Math.round((50 - Math.min(...ys)) * 2)
}

async function add(...path: string[]) {
  await userEvent.click(screen.getByRole("button", { name: "Add" }))
  for (const name of path) {
    await userEvent.click(await screen.findByRole("menuitem", { name }))
  }
}

const addEffect = (name: string) => add("Effect", name)

function playTo(ms: number) {
  const video = screen.getByTestId<HTMLVideoElement>("source")
  video.currentTime = ms / 1000
  fireEvent.timeUpdate(video)
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
    await userEvent.click(screen.getByRole("button", { name: "Add" }))
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Effect" })
    )
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
    await add("Track", "Effects track")
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

    await add("Caption")
    expect(latest().captions.added).toEqual([
      { startMs: 0, endMs: 1000, text: "New caption" },
    ])
    expect(await screen.findByText("Written caption")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(latest().captions.added).toEqual([])
  })

  it("puts a caption on a new captions track when the first is busy", async () => {
    const { latest } = setup()
    await add("Caption")
    await add("Caption")
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
    await add("Text")
    expect(latest().textOverlays).toEqual([
      {
        text: "Wait for it",
        position: "top",
        startMs: 0,
        endMs: 3000,
        lane: 0,
      },
    ])
    await add("Text")
    expect(latest().textOverlays[1]).toMatchObject({ startMs: 0, lane: 1 })
  })

  it("adds a library track as music and scales its wave with the volume", async () => {
    const { latest } = setup()
    expect(
      screen.queryByRole("group", { name: "Music track 1" })
    ).not.toBeInTheDocument()
    await add("Music…")
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
    expect(width()).toBe("max(100%, 4000px)")
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(width()).toBe("max(100%, 8000px)")
    await userEvent.click(screen.getByRole("button", { name: "Fit" }))
    expect(width()).not.toContain("px")
    expect(parseFloat(width())).toBeCloseTo((50 / 30) * 100, 2)
  })

  it("zooms around the pointer when the wheel turns over the tracks", () => {
    setup()
    const { scroller, axisWidth } = layOut(1000)
    const msAt = (x: number) =>
      ((x - 32 + scroller.scrollLeft) / axisWidth()) * 50_000
    const before = msAt(516)
    expect(fireEvent.wheel(scroller, { deltaY: -100, clientX: 516 })).toBe(
      false
    )
    expect(axisWidth()).toBeGreaterThan(4000)
    expect(msAt(516)).toBeCloseTo(before, -2)
    fireEvent.wheel(scroller, { deltaY: 100_000, clientX: 516 })
    expect(axisWidth()).toBe(936)
  })

  it("pans sideways with the wheel instead of zooming", () => {
    setup()
    const { scroller, axisWidth } = layOut(1000)
    fireEvent.wheel(scroller, { deltaX: 120, deltaY: 4 })
    expect(scroller.scrollLeft).toBe(120)
    expect(axisWidth()).toBe(4000)
  })

  it("moves the view by dragging the handle above the ruler", () => {
    setup()
    expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument()
    const { scroller } = layOut(1016)
    const handle = screen.getByRole("scrollbar", { name: "Timeline position" })
    expect(handle).toHaveAttribute("aria-valuenow", "0")
    handle.parentElement!.getBoundingClientRect = () =>
      ({ left: 0, width: 1000 }) as DOMRect
    handle.getBoundingClientRect = () => ({ left: 0, width: 44 }) as DOMRect
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 20 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 259 })
    expect(scroller.scrollLeft).toBe(762)
    fireEvent.scroll(scroller)
    expect(handle).toHaveAttribute("aria-valuenow", "25")
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 600 })
    expect(scroller.scrollLeft).toBe(762)

    fireEvent.pointerDown(handle.parentElement!, { button: 0, clientX: 978 })
    expect(scroller.scrollLeft).toBe(3048)

    fireEvent.keyDown(handle, { key: "Home" })
    expect(scroller.scrollLeft).toBe(0)
  })

  it("widens the line behind the handle as the timeline zooms in", async () => {
    setup()
    const { scroller } = layOut(1016)
    const line = document.querySelector<HTMLElement>(
      "[data-slot=timeline-zoom-level]"
    )!
    const percent = () => parseFloat(/([\d.]+)%/.exec(line.style.width)![1]!)
    expect(percent()).toBeCloseTo(25, 5)
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    fireEvent.scroll(scroller)
    expect(percent()).toBeGreaterThan(25)
    expect(percent()).toBeLessThan(50)
  })

  it("edits an effect from its inspector", async () => {
    const { latest } = setup({
      effects: {
        edited: true,
        events: [
          { kind: "shake", startMs: 12_000, endMs: 12_500, intensity: "light" },
        ],
      },
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Shake light at 0:02.0" })
    )
    await userEvent.click(await screen.findByRole("button", { name: "Strong" }))
    expect(latest().effects?.events[0]).toMatchObject({ intensity: "strong" })
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(latest().effects?.events).toEqual([])
  })

  it("plans the effects again from the Add menu", async () => {
    const { onPlanEffects } = setup({ effects: { edited: true, events: [] } })
    await add("Effect", "Reset effects to auto")
    expect(onPlanEffects).toHaveBeenCalledOnce()
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

describe("ClipTimeline editing keys", () => {
  const zoom = {
    kind: "zoom" as const,
    startMs: 12_000,
    endMs: 13_500,
    scale: 1.4,
    focus: { x: 0.5, y: 0.5 },
    lane: 0,
  }

  it("splits the selected effect at the playhead", async () => {
    const { latest } = setup({
      effects: { edited: true, events: [zoom] },
      selection: { type: "effect", index: 0 },
    })
    const split = screen.getByRole("button", { name: "Split at playhead (S)" })
    expect(split).toBeDisabled()
    playTo(12_600)
    expect(split).toBeEnabled()
    fireEvent.keyDown(document.body, { key: "s" })
    expect(latest().effects?.events).toMatchObject([
      { kind: "zoom", startMs: 12_000, endMs: 12_600, scale: 1.4 },
      { kind: "zoom", startMs: 12_600, endMs: 13_500, scale: 1.4 },
    ])
  })

  it("won't split a spoken caption", () => {
    setup({ selection: { type: "caption", ref: { lane: 0, index: 0 } } })
    playTo(11_500)
    expect(
      screen.getByRole("button", { name: "Split at playhead (S)" })
    ).toBeDisabled()
  })

  it("starts and ends the clip at the playhead with I and O", () => {
    const { latest } = setup()
    playTo(15_000)
    fireEvent.keyDown(document.body, { key: "i" })
    expect(latest()).toMatchObject({ startMs: 15_000, endMs: 40_000 })
    playTo(30_000)
    fireEvent.keyDown(document.body, { key: "o" })
    expect(latest()).toMatchObject({ startMs: 15_000, endMs: 30_000 })
  })

  it("refuses a trim shorter than a clip can be", () => {
    const { latest } = setup()
    playTo(39_000)
    fireEvent.keyDown(document.body, { key: "i" })
    expect(latest()).toMatchObject({ startMs: 10_000, endMs: 40_000 })
  })

  it("removes the selected item with Delete from anywhere", () => {
    const { latest } = setup({
      effects: { edited: true, events: [zoom] },
      selection: { type: "effect", index: 0 },
    })
    fireEvent.keyDown(document.body, { key: "Delete" })
    expect(latest().effects?.events).toEqual([])
    expect(latest().selection).toBeNull()
  })

  it("seeks and clears the selection when an empty part of a track is pressed", () => {
    const { latest } = setup({
      effects: { edited: true, events: [zoom] },
      selection: { type: "effect", index: 0 },
    })
    const axis = screen.getByTestId("timeline-scroller")
      .firstElementChild as HTMLElement
    axis.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 220 }) as DOMRect
    fireEvent.pointerDown(axis, { button: 0, clientX: 250 })
    expect(latest().selection).toBeNull()
    expect(screen.getByTestId<HTMLVideoElement>("source").currentTime).toBe(25)
  })

  it("shows the playhead time over the tracks", () => {
    setup()
    playTo(22_400)
    expect(screen.getByTestId("timeline-playhead")).toHaveTextContent("0:12.4")
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
