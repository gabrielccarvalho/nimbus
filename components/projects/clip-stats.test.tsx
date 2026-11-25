import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { refreshStatsAction } from "@/features/publishing/actions"

import { ClipStats } from "./clip-stats"
import type { PublicationState } from "./publish-dialog"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/publishing/actions", () => ({
  refreshStatsAction: vi.fn(),
}))

const stats = {
  fetchedAt: new Date("2026-11-20T10:00:00Z"),
  views: 1234,
  likes: 56,
  comments: 7,
  averageViewDurationS: 11.52,
  averageViewPercentage: 63.6,
  retention: [1, 0.8, 0.5],
  markers: [0.5],
}

const publication: PublicationState = {
  id: "p1",
  renderAssetId: "r1",
  metadata: { title: "t", description: "d", tags: [], privacy: "public" },
  status: "published",
  url: "https://youtu.be/x",
  error: null,
  publishedAt: new Date("2026-11-10T10:00:00Z"),
  stats,
  early: false,
  refreshing: false,
}

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(refreshStatsAction).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ClipStats", () => {
  it("shows the counts, average view and retention chart", () => {
    render(<ClipStats publication={publication} />)
    expect(screen.getByText("1,234 views")).toBeVisible()
    expect(screen.getByText("56 likes")).toBeVisible()
    expect(screen.getByText("7 comments")).toBeVisible()
    expect(screen.getByText("11.5 s average view")).toBeVisible()
    expect(screen.getByText("64% watched on average")).toBeVisible()
    expect(screen.getByRole("img", { name: /Retention/ })).toBeVisible()
  })

  it("omits the average lines when YouTube has not reported them", () => {
    render(
      <ClipStats
        publication={{
          ...publication,
          stats: {
            ...stats,
            averageViewDurationS: null,
            averageViewPercentage: null,
          },
        }}
      />
    )
    expect(screen.queryByText(/average view/)).toBeNull()
    expect(screen.queryByText(/watched on average/)).toBeNull()
  })

  it("says data is still coming in while early", () => {
    render(<ClipStats publication={{ ...publication, early: true }} />)
    expect(screen.getByText("Data still coming in")).toBeVisible()
  })

  it("offers a refresh when there are no stats yet", async () => {
    vi.mocked(refreshStatsAction).mockResolvedValue({
      ok: true,
      value: { publicationId: "p1" },
    })
    render(<ClipStats publication={{ ...publication, stats: null }} />)
    expect(screen.getByText("No stats yet")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Refresh stats" }))
    expect(refreshStatsAction).toHaveBeenCalledWith("p1")
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("explains an empty retention curve instead of drawing it", () => {
    render(
      <ClipStats
        publication={{ ...publication, stats: { ...stats, retention: [] } }}
      />
    )
    expect(
      screen.getByText("YouTube hasn't shared the retention curve yet")
    ).toBeVisible()
    expect(screen.queryByRole("img")).toBeNull()
  })

  it("shows removed publications without a refresh button", () => {
    render(<ClipStats publication={{ ...publication, status: "removed" }} />)
    expect(screen.getByText("Removed from YouTube")).toBeVisible()
    expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull()
  })

  it("disables the button while a refresh is running", () => {
    render(<ClipStats publication={{ ...publication, refreshing: true }} />)
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled()
  })

  it("re-polls every 5 s while refreshing and stops once it is done", () => {
    vi.useFakeTimers()
    const { rerender, unmount } = render(
      <ClipStats publication={{ ...publication, refreshing: true }} />
    )
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)

    rerender(<ClipStats publication={{ ...publication, refreshing: false }} />)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)

    rerender(<ClipStats publication={{ ...publication, refreshing: true }} />)
    unmount()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("reports a failed refresh", async () => {
    const { toast } = await import("sonner")
    vi.mocked(refreshStatsAction).mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "Stats are already refreshing" },
    })
    render(<ClipStats publication={publication} />)
    await userEvent.click(screen.getByRole("button", { name: "Refresh stats" }))
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Stats are already refreshing")
    )
  })
})
