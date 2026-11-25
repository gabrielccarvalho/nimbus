import { act, render } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dbToGain, type MusicPlan } from "@/features/music/envelope"

type Media = { paused: boolean; time: number; readyState: number }
const media = new WeakMap<HTMLMediaElement, Media>()
const stateOf = (element: HTMLMediaElement) => {
  let state = media.get(element)
  if (!state) {
    state = { paused: true, time: 0, readyState: 4 }
    media.set(element, state)
  }
  return state
}

class FakeGain {
  gain = {
    value: 1,
    setTargetAtTime: vi.fn((value: number) => {
      this.gain.value = value
    }),
    setValueAtTime: vi.fn((value: number) => {
      this.gain.value = value
    }),
  }
  connect = vi.fn((node: unknown) => node)
  disconnect = vi.fn()
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: AudioContextState = "suspended"
  currentTime = 0
  destination = {}
  sources: {
    element: HTMLMediaElement
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[] = []
  constructor() {
    FakeAudioContext.instances.push(this)
  }
  resume = vi.fn(async () => {
    this.state = "running"
  })
  createGain = vi.fn(() => new FakeGain())
  createMediaElementSource = vi.fn((element: HTMLMediaElement) => {
    const node = {
      element,
      connect: vi.fn((next: unknown) => next),
      disconnect: vi.fn(),
    }
    this.sources.push(node)
    return node
  })
  sourceFor(element: HTMLMediaElement) {
    return this.sources.find((s) => s.element === element)
  }
  gainFor(element: HTMLMediaElement) {
    return this.sourceFor(element)?.connect.mock.calls[0]?.[0] as
      FakeGain | undefined
  }
}

let frames: FrameRequestCallback[] = []
function frame() {
  act(() => {
    const pending = frames
    frames = []
    for (const callback of pending) callback(0)
  })
}

let MusicPreview: typeof import("./music-preview").MusicPreview
let VideoPlayerProvider: typeof import("@/components/ui/video-player").VideoPlayerProvider
let VideoPlayerVideo: typeof import("@/components/ui/video-player").VideoPlayerVideo

beforeEach(async () => {
  FakeAudioContext.instances = []
  frames = []
  vi.stubGlobal("AudioContext", FakeAudioContext)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  const proto = HTMLMediaElement.prototype
  Object.defineProperty(proto, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return stateOf(this).paused
    },
  })
  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return stateOf(this).time
    },
    set(this: HTMLMediaElement, value: number) {
      stateOf(this).time = value
    },
  })
  Object.defineProperty(proto, "readyState", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return stateOf(this).readyState
    },
  })
  Object.defineProperty(proto, "duration", { configurable: true, value: 600 })
  vi.spyOn(proto, "play").mockImplementation(function (this: HTMLMediaElement) {
    stateOf(this).paused = false
    this.dispatchEvent(new Event("play"))
    return Promise.resolve()
  })
  vi.spyOn(proto, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    stateOf(this).paused = true
    this.dispatchEvent(new Event("pause"))
  })
  vi.resetModules()
  ;({ MusicPreview } = await import("./music-preview"))
  ;({ VideoPlayerProvider, VideoPlayerVideo } =
    await import("@/components/ui/video-player"))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const plan: MusicPlan = {
  musicDb: -16,
  lengthMs: 8_000,
  fadeInMs: 0,
  fadeOutMs: 0,
  duck: [{ startMs: 4_000, endMs: 6_000 }],
}

function renderPreview(
  props: Partial<React.ComponentProps<typeof MusicPreview>> = {}
) {
  const all = {
    src: "/api/music/t1",
    plan,
    trackStartMs: 45_000,
    clipStartMs: 10_000,
    sourceDb: 4,
    onUnavailable: vi.fn(),
    ...props,
  }
  const tree = (next: typeof all) => (
    <VideoPlayerProvider>
      <VideoPlayerVideo src="/source.mp4" />
      <MusicPreview {...next} />
    </VideoPlayerProvider>
  )
  const view = render(tree(all))
  return {
    ...all,
    video: view.container.querySelector("video")!,
    get audio() {
      return view.container.querySelector("audio")!
    },
    rerender: (next: Partial<typeof all>) =>
      view.rerender(tree({ ...all, ...next })),
    unmount: view.unmount,
  }
}

async function play(video: HTMLVideoElement) {
  await act(async () => {
    await video.play()
  })
}

describe("MusicPreview", () => {
  it("creates and routes nothing before the video plays", () => {
    const { video, audio } = renderPreview()
    stateOf(video).time = 15
    frame()
    expect(FakeAudioContext.instances).toHaveLength(0)
    expect(audio.paused).toBe(true)
  })

  it("resumes the context on play and routes the video once at the source gain", async () => {
    const { video, rerender } = renderPreview()
    await play(video)
    const [ctx] = FakeAudioContext.instances
    expect(ctx!.resume).toHaveBeenCalled()
    expect(ctx!.gainFor(video)!.gain.value).toBeCloseTo(dbToGain(4))

    rerender({ sourceDb: -6 })
    act(() => video.pause())
    await play(video)
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(
      ctx!.createMediaElementSource.mock.calls.filter(([el]) => el === video)
    ).toHaveLength(1)
    expect(ctx!.gainFor(video)!.gain.value).toBeCloseTo(dbToGain(-6))
  })

  it("leaves the video's sound alone while the context stays suspended", async () => {
    class SuspendedContext extends FakeAudioContext {
      override resume = vi.fn(() => new Promise<void>(() => {}))
    }
    vi.stubGlobal("AudioContext", SuspendedContext)
    const { video } = renderPreview()
    await play(video)
    const [ctx] = FakeAudioContext.instances
    expect(ctx!.resume).toHaveBeenCalled()
    expect(ctx!.createMediaElementSource).not.toHaveBeenCalled()
  })

  it("keeps the track in step with the clip", async () => {
    const { video, audio } = renderPreview()
    await play(video)
    stateOf(video).time = 15
    frame()
    expect(audio.currentTime).toBe(50)
    expect(audio.paused).toBe(false)

    stateOf(video).time = 15.1
    frame()
    expect(audio.currentTime).toBe(50)

    stateOf(video).time = 15.3
    frame()
    expect(audio.currentTime).toBeCloseTo(50.3)
  })

  it("follows the render's music gain", async () => {
    const { video, audio } = renderPreview()
    await play(video)
    const gain = FakeAudioContext.instances[0]!.gainFor(audio)!
    stateOf(video).time = 12
    frame()
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(dbToGain(-16)),
      0,
      0.015
    )
    stateOf(video).time = 15
    frame()
    expect(gain.gain.value).toBeCloseTo(dbToGain(-26))
  })

  it("stops the music on pause, before the clip and past the track", async () => {
    const { video, audio } = renderPreview()
    await play(video)
    stateOf(video).time = 12
    frame()
    expect(audio.paused).toBe(false)

    act(() => video.pause())
    expect(audio.paused).toBe(true)

    await play(video)
    stateOf(video).time = 9
    frame()
    expect(audio.paused).toBe(true)

    stateOf(video).time = 12
    frame()
    expect(audio.paused).toBe(false)
    stateOf(video).time = 18.5
    frame()
    expect(audio.paused).toBe(true)
  })

  it("resumes a context the browser suspended after routing", async () => {
    const { video } = renderPreview()
    await play(video)
    const [ctx] = FakeAudioContext.instances
    act(() => video.pause())
    ctx!.state = "suspended"
    ctx!.resume.mockClear()
    await play(video)
    expect(ctx!.resume).toHaveBeenCalledTimes(1)
    expect(ctx!.state).toBe("running")
  })

  it("holds the music while the video buffers", async () => {
    const { video, audio } = renderPreview()
    await play(video)
    stateOf(video).time = 12
    frame()
    expect(audio.paused).toBe(false)

    stateOf(video).readyState = 2
    act(() => {
      video.dispatchEvent(new Event("waiting"))
    })
    expect(audio.paused).toBe(true)
    stateOf(video).time = 12.5
    frame()
    expect(audio.paused).toBe(true)

    stateOf(video).readyState = 4
    act(() => {
      video.dispatchEvent(new Event("playing"))
    })
    expect(audio.paused).toBe(false)
    expect(audio.currentTime).toBeCloseTo(47.5)
  })

  it("disconnects the music on a track change and on unmount but keeps the video routed", async () => {
    const view = renderPreview()
    const { video } = view
    await play(video)
    const [ctx] = FakeAudioContext.instances
    const first = view.audio
    const firstSource = ctx!.sourceFor(first)!
    const firstGain = ctx!.gainFor(first)!

    view.rerender({ src: "/api/music/t2" })
    expect(firstSource.disconnect).toHaveBeenCalled()
    expect(firstGain.disconnect).toHaveBeenCalled()
    const second = view.audio
    expect(second).not.toBe(first)
    expect(ctx!.sourceFor(second)).toBeDefined()

    view.unmount()
    expect(ctx!.sourceFor(second)!.disconnect).toHaveBeenCalled()
    expect(ctx!.gainFor(second)!.disconnect).toHaveBeenCalled()
    expect(ctx!.sourceFor(video)!.disconnect).not.toHaveBeenCalled()
    expect(ctx!.gainFor(video)!.disconnect).not.toHaveBeenCalled()
  })

  it("reports a browser without Web Audio and leaves the video alone", async () => {
    vi.stubGlobal("AudioContext", undefined)
    const { video, audio, onUnavailable } = renderPreview()
    expect(onUnavailable).toHaveBeenCalled()
    await play(video)
    stateOf(video).time = 12
    frame()
    expect(video.paused).toBe(false)
    expect(audio.paused).toBe(true)
  })
})
