import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { PeriodPicker } from "./period-picker"

describe("PeriodPicker", () => {
  it("names the period and links to the others", async () => {
    render(<PeriodPicker value={28} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Period: last 28 days" })
    )
    expect((await screen.findByText("28 days")).closest("a")).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByText("7 days").closest("a")).toHaveAttribute(
      "href",
      "/analytics?period=7"
    )
  })
})
