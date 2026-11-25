import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { importShortsAction } from "@/features/analytics/actions"

import { ImportShorts } from "./import-shorts"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/analytics/actions", () => ({
  importShortsAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ImportShorts", () => {
  it("imports and refreshes when idle", async () => {
    vi.mocked(importShortsAction).mockResolvedValue({
      ok: true,
      value: undefined,
    })
    render(
      <ImportShorts
        importing={{ state: "idle", error: null }}
        uploadsSyncedAt={null}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Import past Shorts" })
    )
    expect(importShortsAction).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it("shows progress while running and polls until unmounted", () => {
    vi.useFakeTimers()
    const { unmount } = render(
      <ImportShorts
        importing={{ state: "running", progress: 40 }}
        uploadsSyncedAt={null}
      />
    )
    expect(
      screen.getByRole("button", { name: "Importing… 40%" })
    ).toBeDisabled()
    void act(() => vi.advanceTimersByTime(5000))
    expect(refresh).toHaveBeenCalledTimes(1)
    unmount()
    void act(() => vi.advanceTimersByTime(15000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("explains the quota wait", () => {
    render(
      <ImportShorts
        importing={{ state: "waiting_quota", resumesAt: new Date() }}
        uploadsSyncedAt={null}
      />
    )
    expect(
      screen.getByText("Import continues after YouTube's daily quota resets.")
    ).toBeInTheDocument()
  })

  it("shows an error and the daily sync note", () => {
    render(
      <ImportShorts
        importing={{ state: "idle", error: "YouTube said no" }}
        uploadsSyncedAt={new Date()}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("YouTube said no")
    expect(
      screen.getByText("New uploads are imported daily.")
    ).toBeInTheDocument()
  })
})
