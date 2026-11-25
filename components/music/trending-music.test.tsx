import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { TrendingMusic as TrendingMusicResult } from "@/features/music/schema"

import { TrendingMusic } from "./trending-music"

const chart: TrendingMusicResult = {
  status: "ok",
  region: "BR",
  tracks: [
    {
      videoId: "v1",
      title: "Hit",
      channelTitle: "Artist",
      thumbnailUrl: "https://img/m.jpg",
      durationMs: 184_000,
      views: 12_400_000,
    },
    {
      videoId: "v2",
      title: "Bare",
      channelTitle: "Other",
      thumbnailUrl: null,
      durationMs: null,
      views: 900,
    },
  ],
}

async function renderTrending(result: TrendingMusicResult) {
  await act(async () => {
    render(<TrendingMusic trending={Promise.resolve(result)} />)
  })
}

describe("TrendingMusic", () => {
  it("ranks the chart and links each song to YouTube", async () => {
    await renderTrending(chart)

    const list = await screen.findByRole("list", {
      name: "Trending on YouTube",
    })
    expect(list).toBeInTheDocument()
    expect(screen.getByText(/Top music on YouTube in Brazil/)).toBeVisible()
    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.youtube.com/watch?v=v1",
      "https://www.youtube.com/watch?v=v2",
    ])
    expect(links[0]).toHaveAttribute("target", "_blank")
    expect(links[0]).toHaveTextContent("1")
    expect(screen.getByText("Artist · 3:04 · 12M views")).toBeVisible()
    expect(screen.getByText("Other · 900 views")).toBeVisible()
  })

  it("asks to connect YouTube when there is no channel", async () => {
    await renderTrending({ status: "no_channel" })
    expect(await screen.findByText(/Connect YouTube in Settings/)).toBeVisible()
  })

  it("shows why the chart is missing", async () => {
    await renderTrending({
      status: "error",
      message: "YouTube API quota exceeded",
    })
    expect(await screen.findByText("YouTube API quota exceeded")).toBeVisible()
  })

  it("says when the region has no chart", async () => {
    await renderTrending({ status: "ok", region: "AQ", tracks: [] })
    expect(
      await screen.findByText("YouTube has no music chart for Antarctica.")
    ).toBeVisible()
  })
})
