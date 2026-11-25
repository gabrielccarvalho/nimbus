import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ShortsPanel } from "./shorts-panel"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/features/analytics/actions", () => ({
  importShortsAction: vi.fn(),
}))

describe("ShortsPanel", () => {
  it("shows the empty state beside the import button", () => {
    render(
      <ShortsPanel
        rows={[]}
        median={[]}
        dataThrough={null}
        importing={{ state: "idle", error: null }}
        uploadsSyncedAt={null}
      />
    )
    expect(
      screen.getByText(
        "No Shorts yet. Publish a clip, or import the Shorts you posted before Nimbus."
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Import past Shorts" })
    ).toBeEnabled()
  })
})
