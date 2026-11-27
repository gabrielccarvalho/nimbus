import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TimelineDock } from "./timeline-dock"

describe("TimelineDock", () => {
  it("names the dock, lists a legend entry per kind and marks the axis", () => {
    render(
      <TimelineDock
        label="Where the clips are"
        summary="12 across 1:40"
        durationMs={100_000}
        legend={[
          { kind: "clip", label: "Clip" },
          { kind: "silence", label: "Silence" },
        ]}
      >
        <div data-testid="track" />
      </TimelineDock>
    )
    const dock = screen.getByRole("region", { name: "Where the clips are" })
    expect(within(dock).getByText("12 across 1:40")).toBeInTheDocument()
    expect(
      within(dock)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Clip", "Silence"])
    expect(within(dock).getByTestId("track")).toBeInTheDocument()
    expect(within(dock).getByText("0:50")).toBeInTheDocument()
    expect(within(dock).getByText("1:40")).toBeInTheDocument()
  })
})
