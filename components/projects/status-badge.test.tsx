import { describe, expect, it } from "vitest"

import { projectFilter } from "./status-badge"

describe("projectFilter", () => {
  it("files each project under one home filter", () => {
    expect(projectFilter({ status: "awaiting_layout" })).toBe("needs")
    expect(
      projectFilter({ status: "selecting", awaitingManualSelection: true })
    ).toBe("needs")
    expect(projectFilter({ status: "selecting" })).toBe("processing")
    expect(projectFilter({ status: "downloading" })).toBe("processing")
    expect(projectFilter({ status: "rendering" })).toBe("processing")
    expect(projectFilter({ status: "ready_for_review" })).toBe("ready")
    expect(projectFilter({ status: "done" })).toBe("done")
    expect(projectFilter({ status: "failed" })).toBe("other")
    expect(projectFilter({ status: "cancelled" })).toBe("other")
  })
})
