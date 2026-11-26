import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { searchMusicAction } from "@/features/music/actions"
import type { TrendingMusic } from "@/features/music/schema"

import { TrackPicker } from "./track-picker"

vi.mock("@/features/music/actions", () => ({ searchMusicAction: vi.fn() }))

const chart: TrendingMusic = {
  status: "ok",
  region: "BR",
  tracks: [
    {
      videoId: "trend1",
      title: "Pássaro de Fogo",
      channelTitle: "Paula Fernandes",
      thumbnailUrl: null,
      durationMs: 200_000,
      views: 1_000,
    },
  ],
}

async function setup() {
  const onValueChange = vi.fn()
  await act(async () => {
    render(
      <TrackPicker
        id="track"
        library={[]}
        trending={Promise.resolve(chart)}
        value={{ kind: "none" }}
        onValueChange={onValueChange}
      />
    )
  })
  const input = screen.getByPlaceholderText("No music")
  return { onValueChange, input, user: userEvent.setup() }
}

beforeEach(() => vi.mocked(searchMusicAction).mockReset())

describe("TrackPicker", () => {
  it("matches trending songs without accents or case", async () => {
    const { input, user } = await setup()
    await user.type(input, "passaro")
    expect(
      await screen.findByRole("option", { name: /^Pássaro de Fogo/ })
    ).toBeVisible()
  })

  it("searches YouTube when nothing matches and picks a result", async () => {
    vi.mocked(searchMusicAction).mockResolvedValue({
      ok: true,
      value: [
        {
          videoId: "found1",
          title: "Flowers",
          channelTitle: "Miley Cyrus",
          thumbnailUrl: null,
          durationMs: 200_000,
          views: 2_000_000,
        },
      ],
    })
    const { input, onValueChange, user } = await setup()
    await user.type(input, "flower in the")
    expect(await screen.findByText("No songs match.")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Search YouTube for “flower in the”" })
    )
    expect(searchMusicAction).toHaveBeenCalledWith("flower in the")
    await user.click(await screen.findByRole("option", { name: /^Flowers/ }))
    expect(onValueChange).toHaveBeenCalledWith({
      kind: "youtube",
      sound: {
        videoId: "found1",
        title: "Flowers",
        channelTitle: "Miley Cyrus",
        thumbnailUrl: null,
      },
    })
  })

  it("offers no search for a single character", async () => {
    const { input, user } = await setup()
    await user.type(input, "z")
    expect(await screen.findByText("No songs match.")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /Search YouTube/ })
    ).not.toBeInTheDocument()
  })
})
