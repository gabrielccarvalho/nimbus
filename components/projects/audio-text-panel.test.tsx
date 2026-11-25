import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { defaultOverlayText } from "@/features/captions/overlay"
import {
  DEFAULT_AUDIO_MIX,
  type AudioMix,
  type MusicTrackSummary,
} from "@/features/music/schema"

import { AudioTextPanel } from "./audio-text-panel"

const uploaded: MusicTrackSummary = {
  id: "t3",
  title: "Fresh upload",
  durationMs: 30_000,
  peaks: [],
  url: "/api/music/t3",
  usedBy: 0,
}

vi.mock("@/components/music/music-upload-button", () => ({
  MusicUploadButton: ({
    onUploaded,
  }: {
    onUploaded?: (track: MusicTrackSummary) => void
  }) => (
    <button type="button" onClick={() => onUploaded?.(uploaded)}>
      Upload a track
    </button>
  ),
}))

const tracks: MusicTrackSummary[] = [
  {
    id: "t1",
    title: "Summer loop",
    durationMs: 130_000,
    peaks: [0.2, 0.8, 0.5],
    url: "/api/music/t1",
    usedBy: 0,
  },
  {
    id: "t2",
    title: "Night drive",
    durationMs: 200_000,
    peaks: [],
    url: "/api/music/t2",
    usedBy: 1,
  },
]

const mix: AudioMix = {
  ...DEFAULT_AUDIO_MIX,
  trackId: "t1",
  trackStartMs: 45_000,
  musicDb: -12,
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof AudioTextPanel>> = {}
) {
  const all = {
    audioMix: null,
    onAudioMixChange: vi.fn(),
    textOverlay: null,
    onTextOverlayChange: vi.fn(),
    tracks,
    clipDurationMs: 30_000,
    hook: "Wait for the jump",
    title: "Bridge fight",
    captionsNearTop: false,
    previewUnavailable: false,
    disabled: false,
    ...props,
  }
  render(<AudioTextPanel {...all} />)
  return all
}

async function pickTrack(name: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Track" }))
  await userEvent.click(await screen.findByRole("option", { name }))
}

const volume = (name: string) =>
  screen.getByLabelText(name, { selector: "input" })

describe("AudioTextPanel music", () => {
  it("lists the library and starts a mix from the defaults", async () => {
    const { onAudioMixChange } = renderPanel()
    await userEvent.click(screen.getByRole("combobox", { name: "Track" }))
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent)
    ).toEqual(["No music", "Summer loop · 2:10", "Night drive · 3:20"])
    await userEvent.click(
      screen.getByRole("option", { name: "Summer loop · 2:10" })
    )
    expect(onAudioMixChange).toHaveBeenLastCalledWith({
      ...DEFAULT_AUDIO_MIX,
      trackId: "t1",
    })
  })

  it("keeps the mix when switching tracks and clears the track with No music", async () => {
    const { onAudioMixChange } = renderPanel({ audioMix: mix })
    await pickTrack("Night drive · 3:20")
    expect(onAudioMixChange).toHaveBeenLastCalledWith({ ...mix, trackId: "t2" })
    await pickTrack("No music")
    expect(onAudioMixChange).toHaveBeenLastCalledWith({ ...mix, trackId: null })
  })

  it("selects an upload at once, from its start when the old one is past its end", async () => {
    const { onAudioMixChange } = renderPanel({ audioMix: mix })
    await userEvent.click(
      screen.getByRole("button", { name: "Upload a track" })
    )
    expect(onAudioMixChange).toHaveBeenLastCalledWith({
      ...mix,
      trackId: "t3",
      trackStartMs: 0,
    })
  })

  it("scrubs the start in the track over its waveform", () => {
    const { onAudioMixChange } = renderPanel({
      audioMix: mix,
      clipDurationMs: 89_200,
    })
    const start = screen.getByRole("slider", { name: "Start in track" })
    expect(start).toHaveAttribute("aria-valuetext", "0:45 of 2:10")
    expect(
      start.querySelector("[data-slot=timeline-loudness]")
    ).toBeInTheDocument()
    const range = start.querySelector<HTMLElement>(
      "[data-slot=timeline-range]"
    )!
    expect(parseFloat(range.style.left)).toBeCloseTo((45 / 130) * 100)
    expect(parseFloat(range.style.width)).toBeCloseTo((85 / 130) * 100)

    fireEvent.keyDown(start, { key: "ArrowRight" })
    expect(onAudioMixChange).toHaveBeenLastCalledWith({
      ...mix,
      trackStartMs: 45_100,
    })
    expect(
      screen.getByText(
        "Starts at 0:45 of 2:10. The track ends 4.2 s before the clip, so the music fades out early."
      )
    ).toBeInTheDocument()
  })

  it("says nothing about the track end when it outlasts the clip", () => {
    renderPanel({ audioMix: mix })
    expect(screen.getByText("Starts at 0:45 of 2:10")).toBeInTheDocument()
  })

  it("sets the volumes in decibels", () => {
    renderPanel({ audioMix: { ...mix, musicDb: -16 } })
    expect(volume("Music volume")).toHaveAttribute("aria-valuetext", "-16 dB")
    const source = volume("Original audio volume")
    expect(source).toHaveAttribute("aria-valuetext", "0 dB")
    expect(source).toHaveAttribute("min", "-30")
    expect(source).toHaveAttribute("max", "6")
  })

  it("offers the original audio volume without a track", () => {
    const { onAudioMixChange } = renderPanel()
    expect(screen.queryByLabelText("Music volume")).toBeNull()
    expect(
      screen.getByText(
        "Turn the game and voice up or down. 0 dB keeps them as recorded."
      )
    ).toBeInTheDocument()
    const source = volume("Original audio volume")
    fireEvent.keyDown(source, { key: "ArrowUp" })
    expect(onAudioMixChange).toHaveBeenLastCalledWith({
      ...DEFAULT_AUDIO_MIX,
      sourceDb: 1,
    })
  })

  it("toggles ducking and writes the fades in milliseconds", async () => {
    const { onAudioMixChange } = renderPanel({ audioMix: mix })
    await userEvent.click(
      screen.getByRole("switch", {
        name: "Lower the music while someone talks",
      })
    )
    expect(onAudioMixChange).toHaveBeenLastCalledWith({ ...mix, duck: false })

    const fadeIn = screen.getByLabelText("Fade in (seconds)")
    expect(fadeIn).toHaveAttribute("step", "0.1")
    expect(fadeIn).toHaveAttribute("max", "5")
    fireEvent.change(fadeIn, { target: { value: "0.8" } })
    expect(onAudioMixChange).toHaveBeenLastCalledWith({ ...mix, fadeInMs: 800 })
    fireEvent.change(screen.getByLabelText("Fade out (seconds)"), {
      target: { value: "2.5" },
    })
    expect(onAudioMixChange).toHaveBeenLastCalledWith({
      ...mix,
      fadeOutMs: 2_500,
    })
  })

  it("says when the browser can't play the preview", () => {
    renderPanel({ audioMix: mix, previewUnavailable: true })
    expect(
      screen.getByText(
        "This browser can't play the music preview. The render will still include it."
      )
    ).toBeInTheDocument()
  })
})

describe("AudioTextPanel text", () => {
  const overlay = {
    text: "Wait for it",
    position: "top",
    untilMs: 3000,
  } as const

  it("turns the overlay on with the hook and off again", async () => {
    const { onTextOverlayChange } = renderPanel()
    await userEvent.click(
      screen.getByRole("switch", { name: "Show text on the video" })
    )
    expect(onTextOverlayChange).toHaveBeenLastCalledWith({
      text: defaultOverlayText("Wait for the jump", "Bridge fight"),
      position: "top",
      untilMs: 3000,
    })
  })

  it("turns it off", async () => {
    const { onTextOverlayChange } = renderPanel({ textOverlay: overlay })
    await userEvent.click(
      screen.getByRole("switch", { name: "Show text on the video" })
    )
    expect(onTextOverlayChange).toHaveBeenLastCalledWith(null)
  })

  it("edits the text with a counter", () => {
    const { onTextOverlayChange } = renderPanel({ textOverlay: overlay })
    const text = screen.getByLabelText("Text")
    expect(text).toHaveAttribute("maxLength", "80")
    expect(screen.getByText("11/80")).toBeInTheDocument()
    fireEvent.change(text, { target: { value: "Watch this" } })
    expect(onTextOverlayChange).toHaveBeenLastCalledWith({
      ...overlay,
      text: "Watch this",
    })
  })

  it("places the text and sets how long it stays", async () => {
    const { onTextOverlayChange } = renderPanel({ textOverlay: overlay })
    expect(screen.getByRole("radiogroup", { name: "Position" })).toBeVisible()
    await userEvent.click(screen.getByRole("radio", { name: "Center" }))
    expect(onTextOverlayChange).toHaveBeenLastCalledWith({
      ...overlay,
      position: "center",
    })
    fireEvent.change(screen.getByLabelText("Seconds"), {
      target: { value: "4.5" },
    })
    expect(onTextOverlayChange).toHaveBeenLastCalledWith({
      ...overlay,
      untilMs: 4_500,
    })
    await userEvent.click(screen.getByRole("radio", { name: "Whole clip" }))
    expect(onTextOverlayChange).toHaveBeenLastCalledWith({
      ...overlay,
      untilMs: null,
    })
  })

  it("brings back the first seconds from the whole clip", async () => {
    const { onTextOverlayChange } = renderPanel({
      textOverlay: { ...overlay, untilMs: null },
    })
    expect(screen.queryByLabelText("Seconds")).toBeNull()
    await userEvent.click(screen.getByRole("radio", { name: "First seconds" }))
    expect(onTextOverlayChange).toHaveBeenLastCalledWith(overlay)
  })

  it("warns when the captions sit near the top too", () => {
    renderPanel({ textOverlay: overlay, captionsNearTop: true })
    const warning =
      "Your captions sit near the top too. Move them or put the text in the center."
    expect(screen.getByText(warning)).toBeInTheDocument()
  })

  it("doesn't warn for centred text", () => {
    renderPanel({
      textOverlay: { ...overlay, position: "center" },
      captionsNearTop: true,
    })
    expect(screen.queryByText(/Your captions sit near the top/)).toBeNull()
  })
})
