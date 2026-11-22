import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useVideoPlayer,
  VideoPlayer,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "./video-player"

let time = 0
let paused = true

beforeEach(() => {
  time = 0
  paused = true
  const proto = HTMLMediaElement.prototype
  vi.spyOn(proto, "play").mockImplementation(function (this: HTMLMediaElement) {
    paused = false
    this.dispatchEvent(new Event("play"))
    return Promise.resolve()
  })
  vi.spyOn(proto, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused = true
    this.dispatchEvent(new Event("pause"))
  })
  Object.defineProperty(proto, "paused", {
    configurable: true,
    get: () => paused,
  })
  Object.defineProperty(proto, "duration", {
    configurable: true,
    get: () => 90,
  })
  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Player(props: React.ComponentProps<typeof VideoPlayer>) {
  return (
    <VideoPlayer aria-label="Clip" {...props}>
      <VideoPlayerVideo src="/clip.mp4" />
      <VideoPlayerControls>
        <VideoPlayerPlayButton />
        <VideoPlayerSeekBar />
        <VideoPlayerTime />
        <VideoPlayerMuteButton />
      </VideoPlayerControls>
    </VideoPlayer>
  )
}

describe("VideoPlayer", () => {
  it("plays, pauses and shows time once metadata loads", async () => {
    const user = userEvent.setup()
    const { container } = render(<Player />)
    fireEvent.loadedMetadata(container.querySelector("video")!)
    expect(screen.getByText("0:00 / 1:30")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Play" }))
    expect(screen.getByRole("group", { name: "Clip" })).toHaveAttribute(
      "data-state",
      "playing"
    )
    await user.click(screen.getByRole("button", { name: "Pause" }))
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
  })

  it("supports keyboard shortcuts on the focused player", async () => {
    const user = userEvent.setup()
    const onTimeUpdate = vi.fn()
    const { container } = render(<Player onTimeUpdate={onTimeUpdate} />)
    fireEvent.loadedMetadata(container.querySelector("video")!)
    screen.getByRole("group", { name: "Clip" }).focus()
    await user.keyboard("{ArrowRight}{Shift>}{ArrowRight}{/Shift}l")
    expect(time).toBe(11)
    expect(onTimeUpdate).toHaveBeenLastCalledWith(11_000)
    expect(screen.getByText("0:11 / 1:30")).toBeInTheDocument()
    await user.keyboard("j")
    expect(time).toBe(6)
    await user.keyboard("{ArrowLeft}".repeat(10))
    expect(time).toBe(0)
  })

  it("supports controlled and uncontrolled mute", async () => {
    const user = userEvent.setup()
    const onMutedChange = vi.fn()
    const { rerender, container } = render(
      <Player muted={false} onMutedChange={onMutedChange} />
    )
    await user.click(screen.getByRole("button", { name: "Mute" }))
    expect(onMutedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
    rerender(<Player muted onMutedChange={onMutedChange} />)
    expect(container.querySelector("video")!.muted).toBe(true)

    rerender(<Player key="uncontrolled" defaultMuted />)
    await user.click(screen.getByRole("button", { name: "Unmute" }))
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
  })

  it("shares state with siblings through the provider", async () => {
    const user = userEvent.setup()
    function JumpTo() {
      const { seek, currentMs } = useVideoPlayer()
      return <button onClick={() => seek(42_000)}>at {currentMs}</button>
    }
    const { container } = render(
      <VideoPlayerProvider>
        <Player />
        <JumpTo />
      </VideoPlayerProvider>
    )
    fireEvent.loadedMetadata(container.querySelector("video")!)
    await user.click(screen.getByRole("button", { name: "at 0" }))
    expect(screen.getByRole("button", { name: "at 42000" })).toBeInTheDocument()
    const slider = screen.getByRole("slider", { hidden: true })
    expect(slider).toHaveAttribute("aria-valuenow", "42")
    expect(
      document.getElementById(slider.getAttribute("aria-labelledby")!)
    ).toHaveTextContent("Seek")
  })
})
